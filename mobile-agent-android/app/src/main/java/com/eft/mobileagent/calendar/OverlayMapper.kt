package com.eft.mobileagent.calendar

import com.eft.mobileagent.alarm.AlarmSourceType
import com.eft.mobileagent.alarm.SyncedReminder
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

    fun fromSyncedReminder(reminder: SyncedReminder, dateIso: String): OverlayItem? {
        val normalizedDate = reminder.planDate.trim()
        if (normalizedDate.isNotEmpty() && normalizedDate != dateIso) {
            return null
        }

        val source = if (reminder.sourceType == AlarmSourceType.GOOGLE) "google" else "service"
        return OverlayItem(
            id = "sync:${reminder.syncKey}",
            source = source,
            sourceType = reminder.sourceType.value,
            title = reminder.title.ifBlank { "Untitled" },
            startMillis = reminder.triggerAtMillis,
            missionType = reminder.missionType.value,
            taskUid = reminder.taskUid.ifBlank { null },
            targetLatitude = reminder.targetLatitude,
            targetLongitude = reminder.targetLongitude,
            radiusMeters = reminder.radiusMeters.toDouble(),
        )
    }

    fun fromPlannerWorkspace(
        workspace: JSONObject,
        dateIso: String,
    ): List<OverlayItem> {
        val policiesByAssignmentId = mutableMapOf<String, JSONObject>()
        val policiesByTaskUid = mutableMapOf<String, JSONObject>()
        val executionStatesByAssignmentId = mutableMapOf<String, JSONObject>()

        workspace.optJSONArray("alarm_policies").forEachObject { policy ->
            val assignmentId = policy.optString("assignment_id", "").trim()
            if (assignmentId.isNotBlank() && !policiesByAssignmentId.containsKey(assignmentId)) {
                policiesByAssignmentId[assignmentId] = policy
            }

            val taskUid = policy.optString("task_uid", "").trim()
            if (taskUid.isNotBlank() && !policiesByTaskUid.containsKey(taskUid)) {
                policiesByTaskUid[taskUid] = policy
            }
        }

        workspace.optJSONArray("execution_states").forEachObject { state ->
            val assignmentId = state.optString("assignment_id", "").trim()
            if (assignmentId.isNotBlank() && !executionStatesByAssignmentId.containsKey(assignmentId)) {
                executionStatesByAssignmentId[assignmentId] = state
            }
        }

        val items = mutableListOf<OverlayItem>()
        workspace.optJSONArray("daily_assignments").forEachObject { assignment ->
            val overlayItem = fromPlannerAssignment(
                assignment = assignment,
                dateIso = dateIso,
                policiesByAssignmentId = policiesByAssignmentId,
                policiesByTaskUid = policiesByTaskUid,
                executionStatesByAssignmentId = executionStatesByAssignmentId,
            )
            if (overlayItem != null) {
                items += overlayItem
            }
        }
        return items
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

    private fun fromPlannerAssignment(
        assignment: JSONObject,
        dateIso: String,
        policiesByAssignmentId: Map<String, JSONObject>,
        policiesByTaskUid: Map<String, JSONObject>,
        executionStatesByAssignmentId: Map<String, JSONObject>,
    ): OverlayItem? {
        val assignmentId = assignment.optString("assignment_id", "").trim()
        val taskUid = assignment.optString("task_uid", "").trim()
        val policy = policiesByAssignmentId[assignmentId]
            ?: policiesByTaskUid[taskUid]
        val timeRaw = policy?.optString("start_time", "")?.trim().orEmpty()
        if (timeRaw.isBlank()) return null

        val date = runCatching { LocalDate.parse(dateIso) }.getOrNull() ?: return null
        val time = runCatching { LocalTime.parse(timeRaw) }.getOrNull() ?: return null
        val startDateTime = LocalDateTime.of(date, time)
        val startMillis = startDateTime.atZone(koreaZoneId).toInstant().toEpochMilli()
        val endMillis = parsePlannerEndMillis(date, time, policy)
        val sourceType = policy?.optString("source_type", "service")
            .orEmpty()
            .trim()
            .lowercase()
            .ifBlank { "service" }
        val source = if (sourceType == "google") "google" else "service"
        val title = assignment.optString("title", "").trim().ifBlank { "Planner item" }
        val description = buildPlannerDescription(
            assignment = assignment,
            policy = policy,
            executionState = executionStatesByAssignmentId[assignmentId],
        )

        return OverlayItem(
            id = "planner:${assignmentId.ifBlank { taskUid.ifBlank { title } }}",
            source = source,
            sourceType = sourceType,
            title = title,
            startMillis = startMillis,
            endMillis = endMillis,
            taskUid = taskUid.ifBlank { null },
            description = description,
        )
    }

    private fun parsePlannerEndMillis(
        date: LocalDate,
        startTime: LocalTime,
        policy: JSONObject?,
    ): Long? {
        val endRaw = policy?.optString("end_time", "")?.trim().orEmpty()
        if (endRaw.isBlank()) return null

        val endTime = runCatching { LocalTime.parse(endRaw) }.getOrNull() ?: return null
        val endsNextDay = policy?.optBoolean("ends_next_day", false) ?: false
        if (!endsNextDay && !endTime.isAfter(startTime)) {
            return null
        }

        val endDateTime = LocalDateTime.of(
            if (endsNextDay) date.plusDays(1) else date,
            endTime,
        )
        return endDateTime.atZone(koreaZoneId).toInstant().toEpochMilli()
    }

    private fun buildPlannerDescription(
        assignment: JSONObject,
        policy: JSONObject?,
        executionState: JSONObject?,
    ): String? {
        val parts = mutableListOf<String>()
        val status = executionState?.optString("status", "")
            ?.trim()
            ?.ifBlank { null }
            ?: assignment.optString("status", "").trim().ifBlank { null }
            ?: policy?.optString("state", "")?.trim()?.ifBlank { null }
        formatPlannerStatus(status)?.let(parts::add)

        val plannedMinutes = assignment.optInt("planned_minutes", 0)
        if (plannedMinutes > 0) {
            parts += "${plannedMinutes}m"
        }

        return parts.joinToString(" | ").ifBlank { null }
    }

    private fun formatPlannerStatus(raw: String?): String? {
        val normalized = raw?.trim().orEmpty()
        if (normalized.isBlank()) {
            return null
        }
        return normalized
            .split('_')
            .filter { it.isNotBlank() }
            .joinToString(" ") { token ->
                token.lowercase().replaceFirstChar { ch ->
                    if (ch.isLowerCase()) ch.titlecase() else ch.toString()
                }
            }
            .ifBlank { null }
    }

    private fun JSONObject.optDoubleOrNull(key: String): Double? {
        if (!has(key) || isNull(key)) return null
        val value = optDouble(key, Double.NaN)
        if (value.isNaN() || value.isInfinite()) return null
        return value
    }

    private inline fun JSONArray?.forEachObject(block: (JSONObject) -> Unit) {
        val array = this ?: return
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            block(item)
        }
    }
}
