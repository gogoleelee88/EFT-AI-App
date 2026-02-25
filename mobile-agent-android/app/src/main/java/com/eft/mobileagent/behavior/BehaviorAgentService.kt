package com.eft.mobileagent.behavior

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.sqrt

class BehaviorAgentService : Service(), SensorEventListener {
    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private lateinit var queue: BehaviorQueueRepository
    private lateinit var configStore: BehaviorAgentConfigStore
    private var classifier: BehaviorTfliteClassifier? = null
    private var l0Classifier: HarL0TfliteClassifier? = null
    private val l1Mapper = BehaviorL1Mapper()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val flushInFlight = AtomicBoolean(false)

    private val samples = mutableListOf<AccelSample>()
    private var windowStartMillis: Long? = null
    private var running: Boolean = false

    private val windowRunnable = object : Runnable {
        override fun run() {
            processWindowAndQueue()
            flushQueueAsync()
            if (running) {
                mainHandler.postDelayed(this, WINDOW_MS)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        ensureChannel()
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        queue = BehaviorQueueRepository(this)
        configStore = BehaviorAgentConfigStore(this)
        classifier = BehaviorTfliteClassifier(this)
        l0Classifier = HarL0TfliteClassifier(this)
        Log.i(
            TAG,
            "Behavior model ready l1=${classifier?.isReady == true}, l0=${l0Classifier?.isReady == true}",
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopAgent()
                return START_NOT_STICKY
            }
            ACTION_FLUSH -> {
                if (!running) {
                    startAgent()
                }
                flushQueueAsync()
                return START_STICKY
            }
            else -> {
                startAgent()
                return START_STICKY
            }
        }
    }

    override fun onDestroy() {
        stopCollection()
        classifier?.close()
        classifier = null
        l0Classifier?.close()
        l0Classifier = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onSensorChanged(event: SensorEvent?) {
        val ev = event ?: return
        if (ev.sensor.type != Sensor.TYPE_ACCELEROMETER) return

        val now = System.currentTimeMillis()
        if (windowStartMillis == null) {
            windowStartMillis = now
        }
        samples.add(
            AccelSample(
                timestampMillis = now,
                x = ev.values[0],
                y = ev.values[1],
                z = ev.values[2],
            )
        )
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun startAgent() {
        if (running) return
        startForeground(NOTIFICATION_ID, buildNotification())
        startCollection()
        running = true
        mainHandler.removeCallbacks(windowRunnable)
        mainHandler.postDelayed(windowRunnable, WINDOW_MS)
        Log.i(TAG, "Behavior agent started")
    }

    private fun stopAgent() {
        running = false
        stopCollection()
        mainHandler.removeCallbacks(windowRunnable)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        Log.i(TAG, "Behavior agent stopped")
    }

    private fun startCollection() {
        val sensor = accelerometer ?: return
        sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME)
    }

    private fun stopCollection() {
        sensorManager.unregisterListener(this)
    }

    private fun processWindowAndQueue() {
        val start = windowStartMillis ?: return
        val end = System.currentTimeMillis()
        if (samples.size < MIN_SAMPLE_COUNT) {
            samples.clear()
            windowStartMillis = end
            return
        }

        val window = MotionWindow(
            startMillis = start,
            endMillis = end,
            samples = samples.toList(),
        )
        val inference = infer(window)
        val config = configStore.load()
        val behaviorUserId = sanitizeBehaviorUserId(config.userId)

        val payload = BehaviorJson.candidatePayload(
            window = window,
            inference = inference,
            userId = behaviorUserId,
        )
        val path = buildCandidatePath(behaviorUserId, autoAsk = true)
        queue.enqueue(
            kind = BehaviorQueueKind.CANDIDATE,
            path = path,
            payload = payload.toString(),
        )

        samples.clear()
        windowStartMillis = end
    }

    private fun infer(window: MotionWindow): BehaviorInference {
        classifier?.infer(window)?.let { return it }
        l0Classifier?.infer(window)?.let { l0 ->
            val screenOn = runCatching {
                val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager
                powerManager?.isInteractive
            }.getOrNull()
            return l1Mapper.map(window = window, l0 = l0, screenOn = screenOn)
        }
        return inferHeuristic(window)
    }

    private fun inferHeuristic(window: MotionWindow): BehaviorInference {
        val mags = window.samples.map { s ->
            sqrt((s.x * s.x + s.y * s.y + s.z * s.z).toDouble())
        }
        val mean = mags.average()
        val variance = mags.map { m -> (m - mean) * (m - mean) }.average()
        val std = sqrt(variance)

        return when {
            std >= 1.80 -> {
                BehaviorInference(
                    l1Top1 = "workout",
                    confidence = 0.76,
                    marginTop1Top2 = 0.23,
                    topK = listOf(
                        L1TopKItem("workout", 0.76),
                        L1TopKItem("commute", 0.53),
                        L1TopKItem("unknown_event", 0.24),
                    ),
                    triggerReasons = emptyList(),
                )
            }
            std >= 0.90 -> {
                BehaviorInference(
                    l1Top1 = "commute",
                    confidence = 0.71,
                    marginTop1Top2 = 0.19,
                    topK = listOf(
                        L1TopKItem("commute", 0.71),
                        L1TopKItem("workout", 0.52),
                        L1TopKItem("unknown_event", 0.22),
                    ),
                    triggerReasons = emptyList(),
                )
            }
            mean in 9.4..10.4 && std < 0.30 -> {
                BehaviorInference(
                    l1Top1 = "sleep",
                    confidence = 0.63,
                    marginTop1Top2 = 0.10,
                    topK = listOf(
                        L1TopKItem("sleep", 0.63),
                        L1TopKItem("relax", 0.53),
                        L1TopKItem("unknown_event", 0.39),
                    ),
                    triggerReasons = listOf("small_margin"),
                )
            }
            else -> {
                BehaviorInference(
                    l1Top1 = "work_focus",
                    confidence = 0.66,
                    marginTop1Top2 = 0.14,
                    topK = listOf(
                        L1TopKItem("work_focus", 0.66),
                        L1TopKItem("meeting", 0.52),
                        L1TopKItem("unknown_event", 0.31),
                    ),
                    triggerReasons = emptyList(),
                )
            }
        }
    }

    private fun flushQueueAsync() {
        if (!flushInFlight.compareAndSet(false, true)) return
        Thread {
            try {
                val config = configStore.load()
                val behaviorUserId = sanitizeBehaviorUserId(config.userId)
                val client = BehaviorApiClient(
                    baseUrl = config.backendBaseUrl,
                    accessToken = config.accessToken,
                )

                val batch = queue.peekReady(limit = FLUSH_BATCH_SIZE)
                for (item in batch) {
                    val sanitizedPath = sanitizeRequestPath(item.path, behaviorUserId)
                    val sanitizedPayload = sanitizePayload(item.payload, behaviorUserId)
                    val result = runCatching { client.post(sanitizedPath, sanitizedPayload) }
                    result.onSuccess { resp ->
                        when {
                            resp.statusCode in 200..299 -> {
                                queue.markSuccess(item.requestId)
                            }
                            resp.statusCode in NON_RETRYABLE_HTTP_CODES -> {
                                queue.markPermanentFailure(item.requestId)
                                Log.w(TAG, "Dropped non-retryable behavior request: http_${resp.statusCode}")
                            }
                            else -> {
                                queue.markRetry(item.requestId, "http_${resp.statusCode}")
                            }
                        }
                    }.onFailure { err ->
                        queue.markRetry(item.requestId, err.message ?: "network_error")
                    }
                }
            } finally {
                flushInFlight.set(false)
            }
        }.start()
    }

    private fun buildCandidatePath(userId: String?, autoAsk: Boolean): String {
        val autoAskText = if (autoAsk) "true" else "false"
        return if (userId.isNullOrBlank()) {
            "/api/spec/behavior/candidates?auto_ask=$autoAskText"
        } else {
            val encoded = URLEncoder.encode(userId, Charsets.UTF_8.name())
            "/api/spec/behavior/candidates?auto_ask=$autoAskText&user_id=$encoded"
        }
    }

    private fun sanitizeBehaviorUserId(rawUserId: String?): String? {
        val trimmed = rawUserId.orEmpty().trim()
        if (trimmed.isBlank()) return null
        if (trimmed.contains("@")) return null
        if (trimmed.contains(" ")) return null
        return trimmed
    }

    private fun sanitizeRequestPath(rawPath: String, defaultUserId: String?): String {
        val trimmedPath = rawPath.trim()
        if (trimmedPath.isBlank() || !trimmedPath.startsWith("/")) {
            return trimmedPath
        }
        val uri = runCatching { Uri.parse(trimmedPath) }.getOrNull() ?: return trimmedPath
        return try {
            val existingUserId = sanitizeBehaviorUserId(uri.getQueryParameter("user_id"))
            val resolvedUserId = existingUserId ?: sanitizeBehaviorUserId(defaultUserId)
            val builder = uri.buildUpon().clearQuery()
            for (name in uri.queryParameterNames) {
                if (name == "user_id") continue
                builder.appendQueryParameter(name, uri.getQueryParameter(name))
            }
            if (resolvedUserId != null) {
                builder.appendQueryParameter("user_id", resolvedUserId)
            }
            val sanitizedUri = builder.build()
            val query = sanitizedUri.encodedQuery
            if (query.isNullOrBlank()) {
                sanitizedUri.path.orEmpty()
            } else {
                "${sanitizedUri.path}?$query"
            }
        } catch (err: Exception) {
            Log.w(TAG, "Failed to sanitize behavior request path: ${err.message}")
            rawPath
        }
    }

    private fun sanitizePayload(rawPayload: String, defaultUserId: String?): String {
        return runCatching {
            val obj = JSONObject(rawPayload)
            val existingUserId = sanitizeBehaviorUserId(obj.optString("user_id", null))
            val resolvedUserId = existingUserId ?: sanitizeBehaviorUserId(defaultUserId)
            if (resolvedUserId == null) {
                obj.remove("user_id")
            } else {
                obj.put("user_id", resolvedUserId)
            }
            obj.toString()
        }.getOrElse {
            Log.w(TAG, "Failed to sanitize behavior request payload: ${it.message}")
            rawPayload
        }
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("Behavior Agent Running")
            .setContentText("Collecting motion windows and syncing behavior logs")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Behavior Agent",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Foreground channel for behavior logging"
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        }
        manager.createNotificationChannel(channel)
    }

    companion object {
        private const val TAG = "BehaviorAgentService"
        private const val CHANNEL_ID = "behavior_agent_channel"
        private const val NOTIFICATION_ID = 43001
        private const val WINDOW_MS = 2_560L
        private const val MIN_SAMPLE_COUNT = 20
        private const val FLUSH_BATCH_SIZE = 20
        private val NON_RETRYABLE_HTTP_CODES = setOf(400, 401, 403, 404, 409, 410, 422)

        const val ACTION_START = "com.eft.mobileagent.action.BEHAVIOR_START"
        const val ACTION_STOP = "com.eft.mobileagent.action.BEHAVIOR_STOP"
        const val ACTION_FLUSH = "com.eft.mobileagent.action.BEHAVIOR_FLUSH"

        fun start(context: Context) {
            val intent = Intent(context, BehaviorAgentService::class.java).apply { action = ACTION_START }
            runCatching { ContextCompat.startForegroundService(context, intent) }
        }

        fun stop(context: Context) {
            val intent = Intent(context, BehaviorAgentService::class.java).apply { action = ACTION_STOP }
            runCatching { context.startService(intent) }
        }

        fun flush(context: Context) {
            val intent = Intent(context, BehaviorAgentService::class.java).apply { action = ACTION_FLUSH }
            runCatching { context.startService(intent) }
        }
    }
}
