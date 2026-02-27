package com.eft.mobileagent.alarm

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.OffsetDateTime

data class SyncedReminder(
    val syncKey: String,
    val title: String,
    val triggerAtMillis: Long,
    val nextFireAtUtcRaw: String,
    val missionType: AlarmMissionType,
    val sourceType: AlarmSourceType,
)

data class SyncLoginUser(
    val userId: String,
    val email: String?,
    val name: String?,
)

class ReminderSyncClient(baseUrl: String) {
    private val normalizedBaseUrl = baseUrl.trim().removeSuffix("/")

    companion object {
        private const val TAG = "ReminderSyncClient"
    }

    fun login(identifier: String): SyncLoginUser {
        val endpoint = "$normalizedBaseUrl/api/reminders/mobile-login"
        val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 5000
            readTimeout = 5000
            doOutput = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json")
        }

        val payload = JSONObject()
            .put("identifier", identifier)
            .toString()

        val body = try {
            conn.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else (conn.errorStream ?: conn.inputStream)
            val text = stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            if (code !in 200..299) {
                throw IllegalStateException("HTTP $code: $text")
            }
            text
        } finally {
            conn.disconnect()
        }

        val json = JSONObject(body)
        val ok = json.optBoolean("ok", false)
        if (!ok) {
            val error = json.optString("error", "login_failed")
            throw IllegalStateException(error)
        }
        val user = json.optJSONObject("user")
            ?: throw IllegalStateException("user_not_found")
        val userId = user.optString("id", "").trim()
        if (userId.isBlank()) {
            throw IllegalStateException("invalid_user_id")
        }
        return SyncLoginUser(
            userId = userId,
            email = user.optString("email", "").trim().ifBlank { null },
            name = user.optString("name", "").trim().ifBlank { null },
        )
    }

    fun fetchActiveReminders(userId: String, limit: Int = 50): List<SyncedReminder> {
        val encodedUserId = URLEncoder.encode(userId, Charsets.UTF_8.name())
        val conn = (URL("$normalizedBaseUrl/api/reminders/mobile-sync?user_id=$encodedUserId&limit=$limit").openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 5000
            readTimeout = 5000
            setRequestProperty("Accept", "application/json")
        }

        val body = try {
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else (conn.errorStream ?: conn.inputStream)
            val text = stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            if (code !in 200..299) {
                throw IllegalStateException("HTTP $code: $text")
            }
            text
        } finally {
            conn.disconnect()
        }

        val json = JSONObject(body)
        val alarms = json.optJSONArray("alarms") ?: return emptyList()

        val out = mutableListOf<SyncedReminder>()
        for (i in 0 until alarms.length()) {
            val item = alarms.optJSONObject(i) ?: continue
            val fireAtRaw = item.optString("next_fire_at_utc", "").trim()
            val syncKey = item.optString("sync_key", "").ifBlank {
                "${item.optInt("day_id")}:${item.optString("task_uid")}:${item.optString("alarm_time_local")}:${item.optString("repeat_rule")}"
            }
            val resolvedSyncKey = syncKey.ifBlank { "index_$i" }
            val sourceType = if (item.optString("source_type", "").trim().lowercase() == AlarmSourceType.GOOGLE.value) {
                AlarmSourceType.GOOGLE
            } else {
                AlarmSourceType.SERVICE
            }
            val missionType = if (item.optString("mission_type", "").trim().lowercase() == AlarmMissionType.LOCATION_ARRIVAL.value) {
                AlarmMissionType.LOCATION_ARRIVAL
            } else {
                AlarmMissionType.MANUAL_DISMISS
            }

            Log.i(
                TAG,
                "mobile-sync alarm sync_key=$resolvedSyncKey mission_type=${missionType.value} " +
                    "source_type=${sourceType.value} next_fire_at_utc=${fireAtRaw.ifBlank { "(missing)" }}",
            )

            val parsedNextFireAt = runCatching {
                OffsetDateTime.parse(fireAtRaw).toInstant()
            }.getOrNull()

            if (fireAtRaw.isBlank() || parsedNextFireAt == null) {
                continue
            }

            val triggerAtMillis = parsedNextFireAt.toEpochMilli()
            val title = item.optString("title", "Untitled")
            out += SyncedReminder(
                syncKey = resolvedSyncKey,
                title = title,
                triggerAtMillis = triggerAtMillis,
                nextFireAtUtcRaw = fireAtRaw,
                missionType = missionType,
                sourceType = sourceType,
            )
        }
        return out
    }
}
