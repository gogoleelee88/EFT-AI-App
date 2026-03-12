package com.eft.mobileagent.alarm

import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.OffsetDateTime
import java.util.UUID

data class SyncedReminder(
    val syncKey: String,
    val title: String,
    val planDate: String,
    val taskUid: String,
    val triggerAtMillis: Long,
    val nextFireAtUtcRaw: String,
    val startTimeLocal: String? = null,
    val endTimeLocal: String? = null,
    val endsNextDay: Boolean = false,
    val missionType: AlarmMissionType,
    val sourceType: AlarmSourceType,
    val targetLatitude: Double? = null,
    val targetLongitude: Double? = null,
    val radiusMeters: Float = TargetLocation.DEFAULT_RADIUS_METERS,
)

data class SyncLoginUser(
    val userId: String,
    val email: String?,
    val name: String?,
    val accessToken: String? = null,
    val refreshToken: String? = null,
)

data class PairingClaimResult(
    val userId: String,
    val accessToken: String?,
    val refreshToken: String?,
)

data class PlanDaySaveResult(
    val dayId: Int,
    val date: String,
    val taskUid: String?,
)

class ReminderSyncClient(baseUrl: String) {
    private val normalizedBaseUrl = baseUrl.trim().removeSuffix("/")

    companion object {
        private const val TAG = "ReminderSyncClient"
    }

    private fun JSONObject.optNullableDouble(vararg keys: String): Double? {
        keys.forEach { key ->
            if (!has(key) || isNull(key)) return@forEach
            return optDouble(key).takeUnless { it.isNaN() || it.isInfinite() }
        }
        return null
    }

    fun claimPairing(code: String): PairingClaimResult {
        val endpoint = "$normalizedBaseUrl/api/pairing/claim"
        val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 5000
            readTimeout = 5000
            doOutput = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json")
        }

        val payload = JSONObject()
            .put("code", code.trim())
            .toString()

        val body = try {
            conn.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
            val http = conn.responseCode
            val stream = if (http in 200..299) conn.inputStream else (conn.errorStream ?: conn.inputStream)
            val text = stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            if (http !in 200..299) {
                throw IllegalStateException("HTTP $http: $text")
            }
            text
        } finally {
            conn.disconnect()
        }

        val json = JSONObject(body)
        if (json.has("ok") && !json.optBoolean("ok", true)) {
            val error = json.optString("error", "pairing_failed")
            throw IllegalStateException(error)
        }
        val userId = json.optString("user_id", "").trim()
        if (userId.isBlank()) {
            throw IllegalStateException("invalid_user_id")
        }
        return PairingClaimResult(
            userId = userId,
            accessToken = json.optString("access_token", "").trim().ifBlank { null },
            refreshToken = json.optString("refresh_token", "").trim().ifBlank { null },
        )
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
            accessToken = json.optString("access_token", "").trim().ifBlank { null },
            refreshToken = json.optString("refresh_token", "").trim().ifBlank { null },
        )
    }

    fun savePlanDayWithSingleAlarm(
        @Suppress("UNUSED_PARAMETER") userId: String,
        planDate: String,
        alarmStartTimeLocal: String,
        alarmEndTimeLocal: String,
        alarmEndsNextDay: Boolean = false,
        title: String,
        sourceType: AlarmSourceType,
        missionType: AlarmMissionType,
        targetLatitude: Double? = null,
        targetLongitude: Double? = null,
        radiusMeters: Float? = null,
        clientRequestId: String = UUID.randomUUID().toString(),
        expectedVersion: Int? = null,
        accessToken: String? = null,
    ): PlanDaySaveResult {
        val endpoint = "$normalizedBaseUrl/api/spec/plan/day-with-mission"
        val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 7000
            readTimeout = 7000
            doOutput = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json")
            if (!accessToken.isNullOrBlank()) {
                setRequestProperty("Authorization", "Bearer $accessToken")
            }
        }

        val resolvedTitle = title.trim().ifBlank { "Mobile schedule" }
        val missionTypeForPayload = when (missionType) {
            AlarmMissionType.LOCATION_ARRIVAL -> "location"
            AlarmMissionType.TIME_CHECK -> "time_check"
            AlarmMissionType.PHOTO -> "photo"
            AlarmMissionType.MANUAL_DISMISS -> "time_check"
        }
        val missionConfig = JSONObject()
        if (missionType == AlarmMissionType.LOCATION_ARRIVAL && targetLatitude != null && targetLongitude != null) {
            val gps = JSONObject()
                .put("lat", targetLatitude)
                .put("lng", targetLongitude)
            if ((radiusMeters ?: 0f) > 0f) {
                gps.put("radius", radiusMeters)
            }
            missionConfig.put("gps", gps)
            missionConfig.put("gps_lat", targetLatitude)
            missionConfig.put("gps_lng", targetLongitude)
            if ((radiusMeters ?: 0f) > 0f) {
                missionConfig.put("gps_radius", radiusMeters)
            }
        }

        val item = JSONObject()
            .put("task_title", resolvedTitle)
            .put("planned_block_minutes", 15)
            .put("micro_steps", org.json.JSONArray())
            .put(
                "micro_action",
                JSONObject()
                    .put("name", "mobile_alarm")
                    .put("source", "user_custom"),
            )
            .put(
                "missions",
                org.json.JSONArray().put(
                    JSONObject()
                        .put("type", missionTypeForPayload)
                        .put("enabled", true)
                        .put("config", missionConfig),
                ),
            )
            .put("missions_combination_mode", "basic")
            .put(
                "alarm",
                JSONObject()
                    .put("start_time", alarmStartTimeLocal)
                    .put("end_time", alarmEndTimeLocal)
                    .put("ends_next_day", alarmEndsNextDay)
                    .put("time", alarmStartTimeLocal)
                    .put("repeat", "once")
                    .put("source_type", sourceType.value),
            )

        val payload = JSONObject()
            .put("date", planDate)
            .put("mode", 70)
            .put("client_request_id", clientRequestId)
            .put("items", org.json.JSONArray().put(item))
            .apply {
                if (expectedVersion != null) {
                    put("expected_version", expectedVersion)
                }
            }
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
        val dayId = json.optInt("day_id", -1)
        if (dayId <= 0) {
            throw IllegalStateException("invalid_day_id")
        }
        val taskUid = runCatching {
            val items = json.optJSONArray("items") ?: return@runCatching null
            if (items.length() <= 0) return@runCatching null
            items.optJSONObject(0)?.optString("task_uid", "")?.trim()?.ifBlank { null }
        }.getOrNull()
        return PlanDaySaveResult(
            dayId = dayId,
            date = json.optString("date", planDate),
            taskUid = taskUid,
        )
    }

    fun getPlanDayVersionByDate(
        planDate: String,
        accessToken: String?,
    ): Int? {
        val encodedDate = URLEncoder.encode(planDate, Charsets.UTF_8.name())
        val endpoint = "$normalizedBaseUrl/api/spec/plan/day-by-date?date=$encodedDate"
        val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 5000
            readTimeout = 5000
            setRequestProperty("Accept", "application/json")
            if (!accessToken.isNullOrBlank()) {
                setRequestProperty("Authorization", "Bearer $accessToken")
            }
        }

        val body = try {
            val code = conn.responseCode
            if (code !in 200..299) {
                return null
            }
            conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        } finally {
            conn.disconnect()
        }

        val json = runCatching { JSONObject(body) }.getOrNull() ?: return null
        val version = json.optInt("version", -1)
        return version.takeIf { it > 0 }
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
            val planDate = item.optString("plan_date", "").trim()
            val taskUid = item.optString("task_uid", "").trim()
            val missionTypeRaw = item.optString("mission_type", "").trim().lowercase()
            val missionType = when (missionTypeRaw) {
                AlarmMissionType.LOCATION_ARRIVAL.value -> AlarmMissionType.LOCATION_ARRIVAL
                AlarmMissionType.PHOTO.value -> AlarmMissionType.PHOTO
                AlarmMissionType.MANUAL_DISMISS.value -> AlarmMissionType.MANUAL_DISMISS
                // Legacy fallback: treat time_check as manual in app UI.
                AlarmMissionType.TIME_CHECK.value -> AlarmMissionType.MANUAL_DISMISS
                else -> AlarmMissionType.MANUAL_DISMISS
            }
            val targetLatitude = item.optNullableDouble("target_lat", "targetLatitude")
            val targetLongitude = item.optNullableDouble("target_lng", "targetLongitude")
            val startTimeLocal = item.optString("start_time_local", item.optString("alarm_time_local", ""))
                .trim()
                .ifBlank { null }
            val endTimeLocal = item.optString("end_time_local", "")
                .trim()
                .ifBlank { null }
            val endsNextDay = item.optBoolean("ends_next_day", false)
            val radiusMeters = (
                item.optNullableDouble("radius_meters", "radiusMeters")
                    ?.takeIf { it > 0.0 }
                    ?.toFloat()
            ) ?: TargetLocation.DEFAULT_RADIUS_METERS

            Log.i(
                TAG,
                "mobile-sync alarm sync_key=$resolvedSyncKey mission_type=${missionType.value} " +
                    "source_type=${sourceType.value} target_lat=${targetLatitude ?: "null"} " +
                    "target_lng=${targetLongitude ?: "null"} radius_meters=$radiusMeters " +
                    "start_time_local=${startTimeLocal ?: "null"} end_time_local=${endTimeLocal ?: "null"} " +
                    "ends_next_day=$endsNextDay " +
                    "next_fire_at_utc=${fireAtRaw.ifBlank { "(missing)" }}",
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
                planDate = planDate,
                taskUid = taskUid,
                triggerAtMillis = triggerAtMillis,
                nextFireAtUtcRaw = fireAtRaw,
                startTimeLocal = startTimeLocal,
                endTimeLocal = endTimeLocal,
                endsNextDay = endsNextDay,
                missionType = missionType,
                sourceType = sourceType,
                targetLatitude = targetLatitude,
                targetLongitude = targetLongitude,
                radiusMeters = radiusMeters,
            )
        }
        return out
    }
}
