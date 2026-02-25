package com.eft.mobileagent.behavior

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID

enum class BehaviorQueueKind(val value: String) {
    CANDIDATE("candidate"),
    QUESTION("question"),
}

data class AccelSample(
    val timestampMillis: Long,
    val x: Float,
    val y: Float,
    val z: Float,
)

data class MotionWindow(
    val startMillis: Long,
    val endMillis: Long,
    val samples: List<AccelSample>,
)

data class L1TopKItem(
    val label: String,
    val confidence: Double,
)

data class L0Inference(
    val top1: String,
    val confidence: Double,
    val marginTop1Top2: Double,
    val probs: Map<String, Double>,
)

data class BehaviorInference(
    val l1Top1: String,
    val confidence: Double,
    val marginTop1Top2: Double,
    val topK: List<L1TopKItem>,
    val triggerReasons: List<String>,
)

data class QueuedBehaviorRequest(
    val requestId: String,
    val kind: BehaviorQueueKind,
    val path: String,
    val payload: String,
    val createdAtMillis: Long,
    val retryCount: Int,
    val nextAttemptAtMillis: Long,
    val lastError: String?,
)

object BehaviorJson {
    private val isoFormatter: DateTimeFormatter = DateTimeFormatter.ISO_OFFSET_DATE_TIME

    fun toIsoUtc(millis: Long): String {
        return Instant.ofEpochMilli(millis).atOffset(ZoneOffset.UTC).format(isoFormatter)
    }

    fun candidatePayload(
        window: MotionWindow,
        inference: BehaviorInference,
        userId: String?,
    ): JSONObject {
        val payload = JSONObject()
            .put("user_id", userId)
            .put("ts_start", toIsoUtc(window.startMillis))
            .put("ts_end", toIsoUtc(window.endMillis))
            .put("top1", inference.l1Top1)
            .put("confidence", inference.confidence)
            .put("margin_top1_top2", inference.marginTop1Top2)
            .put("mismatch_score", 1.0 - inference.confidence)
            .put("trigger_reasons", JSONArray(inference.triggerReasons))
            .put("pickup_flag", false)

        val topK = JSONArray()
        inference.topK.forEach { item ->
            topK.put(
                JSONObject()
                    .put("label", item.label)
                    .put("confidence", item.confidence)
            )
        }
        payload.put("activity_topk", topK)
        return payload
    }

    fun queueItemToJson(item: QueuedBehaviorRequest): JSONObject {
        return JSONObject()
            .put("request_id", item.requestId)
            .put("kind", item.kind.value)
            .put("path", item.path)
            .put("payload", item.payload)
            .put("created_at_ms", item.createdAtMillis)
            .put("retry_count", item.retryCount)
            .put("next_attempt_at_ms", item.nextAttemptAtMillis)
            .put("last_error", item.lastError)
    }

    fun queueItemFromJson(obj: JSONObject): QueuedBehaviorRequest {
        val kind = when (obj.optString("kind")) {
            BehaviorQueueKind.QUESTION.value -> BehaviorQueueKind.QUESTION
            else -> BehaviorQueueKind.CANDIDATE
        }
        return QueuedBehaviorRequest(
            requestId = obj.optString("request_id", UUID.randomUUID().toString()),
            kind = kind,
            path = obj.optString("path", "/api/spec/behavior/candidates?auto_ask=true"),
            payload = obj.optString("payload", "{}"),
            createdAtMillis = obj.optLong("created_at_ms", System.currentTimeMillis()),
            retryCount = obj.optInt("retry_count", 0),
            nextAttemptAtMillis = obj.optLong("next_attempt_at_ms", 0L),
            lastError = if (obj.has("last_error") && !obj.isNull("last_error")) {
                obj.optString("last_error")
            } else {
                null
            },
        )
    }
}
