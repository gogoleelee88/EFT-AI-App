package com.eft.mobileagent.behavior

import android.content.Context
import android.util.Log
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

class HarL0TfliteClassifier(
    private val context: Context,
    private val modelAssetPath: String = DEFAULT_MODEL_ASSET_PATH,
    private val labelAssetPath: String = DEFAULT_LABEL_ASSET_PATH,
) : AutoCloseable {
    private var interpreter: Interpreter? = null
    private var labels: List<String> = DEFAULT_L0_LABELS
    private var inputTimeSteps: Int = DEFAULT_INPUT_TIME_STEPS
    private var inputChannels: Int = DEFAULT_INPUT_CHANNELS
    private var outputSize: Int = labels.size

    val isReady: Boolean
        get() = interpreter != null

    init {
        labels = loadLabelsFromAsset(context, labelAssetPath, DEFAULT_L0_LABELS)
        outputSize = labels.size
        interpreter = runCatching {
            val mappedModel = loadMappedModel(context, modelAssetPath)
            val options = Interpreter.Options().apply {
                numThreads = 2
            }
            Interpreter(mappedModel, options).also { itp ->
                val inputShape = itp.getInputTensor(0).shape()
                if (inputShape.size >= 3) {
                    inputTimeSteps = inputShape[inputShape.size - 2]
                    inputChannels = inputShape[inputShape.size - 1]
                }
                val outShape = itp.getOutputTensor(0).shape()
                outputSize = outShape.lastOrNull()?.takeIf { it > 0 } ?: outputSize
                labels = alignLabelsToOutput(labels, outputSize)
                Log.i(
                    TAG,
                    "HAR L0 model loaded: in=[$inputTimeSteps,$inputChannels], out=$outputSize, labels=${labels.size}",
                )
            }
        }.onFailure { err ->
            Log.i(TAG, "HAR L0 model unavailable at $modelAssetPath: ${err.message}")
        }.getOrNull()
    }

    fun infer(window: MotionWindow): L0Inference? {
        val itp = interpreter ?: return null
        val input = buildInputBuffer(window.samples, inputTimeSteps, inputChannels) ?: return null
        val output = Array(1) { FloatArray(max(1, outputSize)) }
        val runResult = runCatching { itp.run(input, output) }
        if (runResult.isFailure) {
            Log.w(TAG, "HAR L0 inference failed: ${runResult.exceptionOrNull()?.message}")
            return null
        }
        return decodeOutput(output[0])
    }

    override fun close() {
        runCatching { interpreter?.close() }
        interpreter = null
    }

    private fun decodeOutput(rawScores: FloatArray): L0Inference? {
        val usableSize = min(rawScores.size, labels.size)
        if (usableSize <= 0) return null

        val probs = toProbabilities(rawScores.copyOfRange(0, usableSize))
        val ranked = (0 until usableSize).sortedByDescending { probs[it] }
        val top1Idx = ranked.firstOrNull() ?: return null
        val top2Idx = ranked.getOrNull(1)
        val top1Conf = probs[top1Idx]
        val top2Conf = top2Idx?.let { probs[it] } ?: 0.0
        val margin = (top1Conf - top2Conf).coerceIn(0.0, 1.0)

        val map = buildMap<String, Double> {
            for (idx in 0 until usableSize) {
                put(labels[idx], probs[idx])
            }
        }
        return L0Inference(
            top1 = labels[top1Idx],
            confidence = top1Conf,
            marginTop1Top2 = margin,
            probs = map,
        )
    }

    private fun toProbabilities(scores: FloatArray): List<Double> {
        if (scores.isEmpty()) return emptyList()
        val minScore = scores.minOrNull() ?: 0f
        val sumRaw = scores.sum().toDouble()
        val allNonNegative = minScore >= 0f
        val looksLikeProb = allNonNegative && sumRaw in 0.98..1.02
        if (looksLikeProb) {
            return scores.map { it.toDouble().coerceIn(0.0, 1.0) }
        }
        val maxScore = scores.maxOrNull() ?: 0f
        val exps = scores.map { exp((it - maxScore).toDouble()) }
        val denom = exps.sum().takeIf { it > 0.0 } ?: 1.0
        return exps.map { (it / denom).coerceIn(0.0, 1.0) }
    }

    private fun buildInputBuffer(
        samples: List<AccelSample>,
        targetTimeSteps: Int,
        channels: Int,
    ): ByteBuffer? {
        if (samples.isEmpty() || targetTimeSteps <= 0 || channels <= 0) return null
        if (channels < 3) return null

        val resampled = resample(samples, targetTimeSteps)
        val xs = resampled.map { it.x.toDouble() }
        val ys = resampled.map { it.y.toDouble() }
        val zs = resampled.map { it.z.toDouble() }

        val xMean = xs.average()
        val yMean = ys.average()
        val zMean = zs.average()
        val xStd = safeStd(xs, xMean)
        val yStd = safeStd(ys, yMean)
        val zStd = safeStd(zs, zMean)

        val featureCount = targetTimeSteps * channels
        val buffer = ByteBuffer.allocateDirect(featureCount * 4).order(ByteOrder.nativeOrder())
        for (i in 0 until targetTimeSteps) {
            val x = ((xs[i] - xMean) / xStd).toFloat()
            val y = ((ys[i] - yMean) / yStd).toFloat()
            val z = ((zs[i] - zMean) / zStd).toFloat()
            buffer.putFloat(x)
            buffer.putFloat(y)
            buffer.putFloat(z)
            for (c in 3 until channels) {
                buffer.putFloat(0f)
            }
        }
        buffer.rewind()
        return buffer
    }

    private fun resample(samples: List<AccelSample>, targetLen: Int): List<AccelSample> {
        if (samples.size == targetLen) return samples
        if (samples.size == 1) return List(targetLen) { samples.first() }

        val last = samples.lastIndex.toDouble()
        return List(targetLen) { i ->
            val pos = if (targetLen == 1) 0.0 else (i.toDouble() / (targetLen - 1).toDouble()) * last
            val lo = pos.toInt().coerceIn(0, samples.lastIndex)
            val hi = min(samples.lastIndex, lo + 1)
            val w = pos - lo
            val a = samples[lo]
            val b = samples[hi]
            AccelSample(
                timestampMillis = if (w <= 0.5) a.timestampMillis else b.timestampMillis,
                x = ((1.0 - w) * a.x + w * b.x).toFloat(),
                y = ((1.0 - w) * a.y + w * b.y).toFloat(),
                z = ((1.0 - w) * a.z + w * b.z).toFloat(),
            )
        }
    }

    private fun safeStd(values: List<Double>, mean: Double): Double {
        val variance = values.map { v -> (v - mean) * (v - mean) }.average()
        return sqrt(variance).takeIf { it >= 1e-6 } ?: 1.0
    }

    private fun loadMappedModel(context: Context, assetPath: String): ByteBuffer {
        return runCatching {
            val afd = context.assets.openFd(assetPath)
            FileInputStream(afd.fileDescriptor).channel.use { channel ->
                channel.map(
                    FileChannel.MapMode.READ_ONLY,
                    afd.startOffset,
                    afd.declaredLength,
                )
            }
        }.getOrElse {
            context.assets.open(assetPath).use { input ->
                val bytes = input.readBytes()
                ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder()).apply {
                    put(bytes)
                    rewind()
                }
            }
        }
    }

    private fun loadLabelsFromAsset(
        context: Context,
        assetPath: String,
        defaultLabels: List<String>,
    ): List<String> {
        val loaded = runCatching {
            context.assets.open(assetPath).bufferedReader(Charsets.UTF_8).useLines { lines ->
                lines
                    .map { it.trim() }
                    .filter { it.isNotEmpty() && !it.startsWith("#") }
                    .toList()
            }
        }.getOrNull().orEmpty()
        if (loaded.isEmpty()) {
            return defaultLabels
        }
        return loaded
    }

    private fun alignLabelsToOutput(current: List<String>, modelOutputSize: Int): List<String> {
        if (modelOutputSize <= 0) return current
        if (current.size == modelOutputSize) return current
        if (current.size > modelOutputSize) {
            Log.w(TAG, "HAR L0 label count (${current.size}) > model out ($modelOutputSize), truncating labels")
            return current.take(modelOutputSize)
        }
        Log.w(TAG, "HAR L0 label count (${current.size}) < model out ($modelOutputSize), padding labels")
        val padded = current.toMutableList()
        while (padded.size < modelOutputSize) {
            padded.add("unknown")
        }
        return padded
    }

    companion object {
        private const val TAG = "HarL0Tflite"
        private const val DEFAULT_INPUT_TIME_STEPS = 128
        private const val DEFAULT_INPUT_CHANNELS = 3
        const val DEFAULT_MODEL_ASSET_PATH = "behavior/har_l0.tflite"
        const val DEFAULT_LABEL_ASSET_PATH = "behavior/l0_labels.txt"

        private val DEFAULT_L0_LABELS = listOf(
            "walk",
            "upstairs",
            "downstairs",
            "sit",
            "stand",
            "lay",
            "unknown",
        )
    }
}
