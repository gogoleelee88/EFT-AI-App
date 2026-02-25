package com.eft.mobileagent.behavior

import android.content.Context
import org.json.JSONArray
import java.util.UUID
import kotlin.math.min

class BehaviorQueueRepository(context: Context) {
    private val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    @Synchronized
    fun enqueue(kind: BehaviorQueueKind, path: String, payload: String): String {
        val now = System.currentTimeMillis()
        val item = QueuedBehaviorRequest(
            requestId = UUID.randomUUID().toString(),
            kind = kind,
            path = path,
            payload = payload,
            createdAtMillis = now,
            retryCount = 0,
            nextAttemptAtMillis = now,
            lastError = null,
        )
        val current = loadAll().toMutableList()
        current.add(item)
        if (current.size > MAX_QUEUE_SIZE) {
            val trim = current.size - MAX_QUEUE_SIZE
            repeat(trim) { current.removeAt(0) }
        }
        saveAll(current)
        return item.requestId
    }

    @Synchronized
    fun peekReady(limit: Int): List<QueuedBehaviorRequest> {
        val now = System.currentTimeMillis()
        return loadAll()
            .asSequence()
            .filter { it.nextAttemptAtMillis <= now }
            .take(limit)
            .toList()
    }

    @Synchronized
    fun markSuccess(requestId: String) {
        val left = loadAll().filterNot { it.requestId == requestId }
        saveAll(left)
    }

    @Synchronized
    fun markRetry(requestId: String, error: String?) {
        val now = System.currentTimeMillis()
        val updated = loadAll().map { item ->
            if (item.requestId != requestId) return@map item
            val retry = item.retryCount + 1
            val delayMs = min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * (1L shl min(6, retry)))
            item.copy(
                retryCount = retry,
                nextAttemptAtMillis = now + delayMs,
                lastError = error ?: "unknown_error",
            )
        }
        saveAll(updated)
    }

    @Synchronized
    fun markPermanentFailure(requestId: String) {
        val left = loadAll().filterNot { it.requestId == requestId }
        saveAll(left)
    }

    @Synchronized
    fun clearAll() {
        prefs.edit().remove(KEY_QUEUE).apply()
    }

    @Synchronized
    fun pendingCount(): Int = loadAll().size

    private fun loadAll(): List<QueuedBehaviorRequest> {
        val raw = prefs.getString(KEY_QUEUE, null) ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            buildList {
                for (i in 0 until arr.length()) {
                    val obj = arr.optJSONObject(i) ?: continue
                    add(BehaviorJson.queueItemFromJson(obj))
                }
            }
        }.getOrElse { emptyList() }
    }

    private fun saveAll(items: List<QueuedBehaviorRequest>) {
        val arr = JSONArray()
        items.forEach { arr.put(BehaviorJson.queueItemToJson(it)) }
        prefs.edit().putString(KEY_QUEUE, arr.toString()).apply()
    }

    companion object {
        private const val PREF_NAME = "behavior_agent_store"
        private const val KEY_QUEUE = "behavior_queue"
        private const val MAX_QUEUE_SIZE = 1_500
        private const val BASE_BACKOFF_MS = 2_000L
        private const val MAX_BACKOFF_MS = 10 * 60 * 1000L
    }
}
