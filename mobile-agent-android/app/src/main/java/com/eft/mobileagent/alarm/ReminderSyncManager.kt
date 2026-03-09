package com.eft.mobileagent.alarm

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import com.eft.mobileagent.BuildConfig
import java.net.URI

data class ReminderSyncConfig(
    val baseUrl: String,
    val userId: String,
)

data class ReminderSyncSummary(
    val fetchedCount: Int,
    val scheduledCount: Int,
    val skippedCount: Int,
    val skippedPastCount: Int,
    val skippedMissingTargetCount: Int,
)

class MissingSyncConfigException : IllegalStateException("missing_sync_config")

object ReminderSyncManager {
    private const val TAG = "ReminderSyncManager"
    private const val PREFS_NAME = "mobile_agent_sync"
    private const val KEY_BASE_URL = "backend_base_url"
    private const val KEY_USER_ID = "sync_user_id"
    private const val LEGACY_PREFS_NAME = "reminder_sync_manager"
    private const val LEGACY_KEY_BASE_URL = "base_url"
    private const val LEGACY_KEY_USER_ID = "user_id"

    private const val SCHEDULE_DECISION_CONDITION =
        "if (reminder.missionType == AlarmMissionType.LOCATION_ARRIVAL || " +
            "reminder.missionType == AlarmMissionType.TIME_CHECK || " +
            "reminder.missionType == AlarmMissionType.PHOTO || " +
            "(reminder.missionType == AlarmMissionType.MANUAL_DISMISS && " +
            "reminder.sourceType == AlarmSourceType.SERVICE))"

    private const val GRACE_MILLIS = 60_000L
    private const val LATE_SCHEDULE_DELAY_MILLIS = 1_000L

    private var loggedScheduleCondition = false

    fun normalizeBaseUrl(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.isBlank()) return null
        val uri = runCatching { URI(trimmed) }.getOrNull() ?: return null
        val scheme = uri.scheme?.lowercase() ?: return null
        if (scheme != "http" && scheme != "https") return null
        return trimmed.trimEnd('/')
    }

    fun hasConfig(context: Context): Boolean {
        return loadConfig(context) != null
    }

    fun loadConfig(context: Context): ReminderSyncConfig? {
        val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        readConfigFrom(prefs)?.let { stored ->
            val preferred = preferPublicBackend(stored.baseUrl)
            if (preferred != stored.baseUrl) {
                saveConfig(context, preferred, stored.userId)
                return stored.copy(baseUrl = preferred)
            }
            return stored
        }

        val legacyConfig = readConfigFrom(
            prefs = context.getSharedPreferences(LEGACY_PREFS_NAME, Context.MODE_PRIVATE),
            baseUrlKey = LEGACY_KEY_BASE_URL,
            userIdKey = LEGACY_KEY_USER_ID,
        ) ?: return null

        val preferredLegacyBase = preferPublicBackend(legacyConfig.baseUrl)
        saveConfig(context, preferredLegacyBase, legacyConfig.userId)
        context.getSharedPreferences(LEGACY_PREFS_NAME, Context.MODE_PRIVATE)
            .edit().remove(LEGACY_KEY_BASE_URL).remove(LEGACY_KEY_USER_ID).apply()
        return legacyConfig.copy(baseUrl = preferredLegacyBase)
    }

    private fun readConfigFrom(
        prefs: SharedPreferences,
        baseUrlKey: String = KEY_BASE_URL,
        userIdKey: String = KEY_USER_ID,
    ): ReminderSyncConfig? {
        val baseUrl = normalizeBaseUrl(prefs.getString(baseUrlKey, "").orEmpty()) ?: return null
        val userId = prefs.getString(userIdKey, "").orEmpty().trim()
        if (userId.isBlank()) return null
        return ReminderSyncConfig(baseUrl = baseUrl, userId = userId)
    }

    private fun preferPublicBackend(currentBaseUrl: String): String {
        val fallback = normalizeBaseUrl(BuildConfig.BACKEND_BASE_URL) ?: return currentBaseUrl
        val currentHost = runCatching { URI(currentBaseUrl).host?.lowercase().orEmpty() }.getOrDefault("")
        val fallbackHost = runCatching { URI(fallback).host?.lowercase().orEmpty() }.getOrDefault("")
        if (currentHost.isBlank() || fallbackHost.isBlank()) return currentBaseUrl

        if (isLocalOrPrivateHost(currentHost) && !isLocalOrPrivateHost(fallbackHost)) {
            return fallback
        }
        return currentBaseUrl
    }

    private fun isLocalOrPrivateHost(host: String): Boolean {
        val h = host.trim().lowercase()
        if (h == "localhost" || h == "127.0.0.1" || h == "::1" || h == "0.0.0.0") return true
        if (h.startsWith("10.")) return true
        if (h.startsWith("192.168.")) return true
        if (h.startsWith("169.254.")) return true
        if (h.startsWith("172.")) {
            val secondOctet = h.split(".").getOrNull(1)?.toIntOrNull()
            if (secondOctet != null && secondOctet in 16..31) return true
        }
        return false
    }

    fun saveConfig(context: Context, baseUrl: String, userId: String) {
        val normalizedBaseUrl = normalizeBaseUrl(baseUrl) ?: return
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putString(KEY_BASE_URL, normalizedBaseUrl)
            .putString(KEY_USER_ID, userId.trim())
            .apply()
    }

    fun clearConfig(context: Context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .remove(KEY_BASE_URL)
            .remove(KEY_USER_ID)
            .apply()
    }

    fun syncWithSavedConfig(context: Context, limit: Int = 80): ReminderSyncSummary {
        val config = loadConfig(context) ?: throw MissingSyncConfigException()
        return syncNow(context, config.baseUrl, config.userId, limit)
    }

    fun syncNow(
        context: Context,
        baseUrl: String,
        userId: String,
        limit: Int = 80,
    ): ReminderSyncSummary {
        val normalizedBaseUrl = normalizeBaseUrl(baseUrl)
            ?: throw IllegalArgumentException("Invalid baseUrl: $baseUrl")
        val client = ReminderSyncClient(normalizedBaseUrl)
        val reminders = client.fetchActiveReminders(userId, limit)
        val scheduler = AlarmScheduler(context)
        val scheduledSyncKeys = HashSet<String>()

        var scheduledCount = 0
        var skippedCount = 0
        var skippedPastCount = 0
        var skippedMissingTargetCount = 0

        reminders.forEach { reminder ->
            if (!shouldScheduleReminder(reminder)) {
                skippedCount++
                return@forEach
            }

            if (!scheduledSyncKeys.add(reminder.syncKey)) {
                skippedCount++
                Log.i(TAG, "duplicate schedule skipped sync_key=${reminder.syncKey}")
                return@forEach
            }

            val nowForAlarmMs = System.currentTimeMillis()
            val deltaMillis = reminder.triggerAtMillis - nowForAlarmMs
            val branch = scheduleDecisionBranch(deltaMillis, GRACE_MILLIS)
            if (branch == "skippedPast") {
                skippedPastCount++
                skippedCount++
                return@forEach
            }

            val scheduleAt = if (branch == "lateScheduleDelay") {
                nowForAlarmMs + LATE_SCHEDULE_DELAY_MILLIS
            } else {
                reminder.triggerAtMillis
            }

            val hasTargetLocation =
                reminder.targetLatitude != null && reminder.targetLongitude != null
            if (reminder.missionType == AlarmMissionType.LOCATION_ARRIVAL && !hasTargetLocation) {
                skippedMissingTargetCount++
                skippedCount++
                Log.w(
                    TAG,
                    "location reminder skipped due to missing target sync_key=${reminder.syncKey}",
                )
                return@forEach
            }

            val alarmJob = AlarmJob(
                alarmId = reminder.syncKey,
                triggerAtMillis = scheduleAt,
                label = reminder.title.ifBlank { "(no_title)" },
                startTimeLocal = reminder.startTimeLocal,
                endTimeLocal = reminder.endTimeLocal,
                endsNextDay = reminder.endsNextDay,
                targetLatitude = if (reminder.missionType == AlarmMissionType.LOCATION_ARRIVAL) {
                    reminder.targetLatitude
                } else {
                    null
                },
                targetLongitude = if (reminder.missionType == AlarmMissionType.LOCATION_ARRIVAL) {
                    reminder.targetLongitude
                } else {
                    null
                },
                radiusMeters = if (reminder.missionType == AlarmMissionType.LOCATION_ARRIVAL) {
                    reminder.radiusMeters
                } else {
                    TargetLocation.DEFAULT_RADIUS_METERS
                },
                planDate = reminder.planDate,
                taskUid = reminder.taskUid,
                missionType = reminder.missionType.value,
                sourceType = reminder.sourceType.value,
                enabled = true,
            )

            scheduler.schedule(alarmJob)
            scheduledCount++
        }

        return ReminderSyncSummary(
            fetchedCount = reminders.size,
            scheduledCount = scheduledCount,
            skippedCount = skippedCount,
            skippedPastCount = skippedPastCount,
            skippedMissingTargetCount = skippedMissingTargetCount,
        )
    }

    private fun shouldScheduleReminder(reminder: SyncedReminder): Boolean {
        if (!loggedScheduleCondition) {
            Log.i(TAG, "ScheduleDecisionIf [ReminderSyncManager.kt:shouldScheduleReminder] $SCHEDULE_DECISION_CONDITION")
            loggedScheduleCondition = true
        }
        return reminder.missionType == AlarmMissionType.LOCATION_ARRIVAL ||
            reminder.missionType == AlarmMissionType.TIME_CHECK ||
            reminder.missionType == AlarmMissionType.PHOTO ||
            (reminder.missionType == AlarmMissionType.MANUAL_DISMISS &&
                reminder.sourceType == AlarmSourceType.SERVICE)
    }

    private fun scheduleDecisionBranch(deltaMillis: Long, graceMillis: Long): String {
        return when {
            deltaMillis <= -graceMillis -> "skippedPast"
            deltaMillis < 0L -> "lateScheduleDelay"
            else -> "normal"
        }
    }
}
