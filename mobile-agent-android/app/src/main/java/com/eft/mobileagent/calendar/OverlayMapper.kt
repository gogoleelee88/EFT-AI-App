package com.eft.mobileagent.calendar

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId

object OverlayMapper {
    private val koreaZoneId: ZoneId = ZoneId.of("Asia/Seoul")

    fun fromGoogle(event: JSONObject): OverlayItem? {
        val id = event.optString("id", "").trim().ifBlank { return null }
        val title = event.optString("display_title")
            .ifBlank { event.optString("title", "Untitled") }
        val startRaw = event.optString("start", "").trim()
        val endRaw = event.optString("end", "").trim()
        val description = event.optString("description", "").trim().ifBlank { null }
        val startMillis = parseGoogleDateTime(startRaw) ?: return null
        val endMillis = parseGoogleDateTime(endRaw)
        return OverlayItem(
            id = "google:$id",
            source = "google",
            sourceType = "google",
            title = title,
            startMillis = startMillis,
            endMillis = endMillis,
            missionType = null,
            taskUid = null,
            description = description,
        )
    }

    fun fromPlanItem(item: JSONObject, dateIso: String): OverlayItem? {
        val alarm = item.optJSONObject("alarm") ?: return null
        val timeRaw = alarm.optString("time", "").trim()
        if (timeRaw.isBlank()) return null

        val sourceType = item.optString("source_type", "")
            .ifBlank { alarm.optString("source_type", "service") }
            .trim()
            .lowercase()
            .ifBlank { "service" }
        val source = if (sourceType == "google") "google" else "service"

        val date = runCatching { LocalDate.parse(dateIso) }.getOrNull() ?: return null
        val time = runCatching { LocalTime.parse(timeRaw) }.getOrNull() ?: return null
        val startMillis = LocalDateTime.of(date, time)
            .atZone(koreaZoneId)
            .toInstant()
            .toEpochMilli()

        val location = extractLocation(item.optJSONArray("missions"))
        return OverlayItem(
            id = item.optString("item_id", "").ifBlank { "plan:${item.optString("task_uid", "")}:$dateIso:$timeRaw" },
            source = source,
            sourceType = sourceType,
            title = item.optString("task_title", "Untitled"),
            startMillis = startMillis,
            missionType = normalizeMissionType(item.optJSONArray("missions")),
            taskUid = item.optString("task_uid", "").ifBlank { null },
            targetLatitude = location?.first,
            targetLongitude = location?.second,
            radiusMeters = location?.third,
        )
    }

    private fun normalizeMissionType(missions: JSONArray?): String? {
        val firstEnabled = firstEnabledMission(missions) ?: return null
        return when ((firstEnabled.optString("type", "")).trim().lowercase()) {
            "location" -> "location_arrival"
            "photo" -> "photo"
            "time_check" -> "manual_dismiss"
            "manual_dismiss" -> "manual_dismiss"
            else -> null
        }
    }

    private fun extractLocation(missions: JSONArray?): Triple<Double, Double, Double?>? {
        val mission = firstEnabledMission(missions) ?: return null
        if (mission.optString("type", "").trim().lowercase() != "location") return null
        val config = mission.optJSONObject("config") ?: return null
        val gps = config.optJSONObject("gps")

        val lat = gps?.optDoubleOrNull("lat")
            ?: config.optDoubleOrNull("gps_lat")
            ?: return null
        val lng = gps?.optDoubleOrNull("lng")
            ?: config.optDoubleOrNull("gps_lng")
            ?: return null
        val radius = gps?.optDoubleOrNull("radius")
            ?: config.optDoubleOrNull("gps_radius")
        return Triple(lat, lng, radius)
    }

    private fun firstEnabledMission(missions: JSONArray?): JSONObject? {
        val arr = missions ?: return null
        for (idx in 0 until arr.length()) {
            val mission = arr.optJSONObject(idx) ?: continue
            if (mission.optBoolean("enabled", true)) {
                return mission
            }
        }
        return null
    }

    private fun parseGoogleDateTime(raw: String): Long? {
        if (raw.isBlank()) return null
        return runCatching {
            if (raw.contains("T")) {
                OffsetDateTime.parse(raw).toInstant().toEpochMilli()
            } else {
                LocalDate.parse(raw).atStartOfDay(koreaZoneId).toInstant().toEpochMilli()
            }
        }.getOrNull()
    }

    private fun JSONObject.optDoubleOrNull(key: String): Double? {
        if (!has(key) || isNull(key)) return null
        val value = optDouble(key, Double.NaN)
        if (value.isNaN() || value.isInfinite()) return null
        return value
    }
}
