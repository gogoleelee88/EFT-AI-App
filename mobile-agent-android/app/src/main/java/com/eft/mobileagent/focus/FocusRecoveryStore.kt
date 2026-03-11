package com.eft.mobileagent.focus

import android.content.Context

enum class FocusStage {
    ARMED_AFTER_ALARM,
    WORKING,
    BLOCKED,
    STOPPED,
}

data class FocusRecoveryState(
    val focusSessionId: String?,
    val userId: String?,
    val scheduleId: String?,
    val scheduleName: String?,
    val startedAtMs: Long,
    val stage: FocusStage,
    val lastMeaningfulProgressAtMs: Long,
    val lastRealtimePromptAtMs: Long,
    val snoozeRealtimeUntilAtMs: Long,
    val lastLifecycleRecoveryEventAtMs: Long,
    val lastProgressBlockedEventAtMs: Long,
    val scheduleStartEventSent: Boolean,
    val sensitivity: String,
    val usageStatsEnabled: Boolean,
)

class FocusRecoveryStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun load(): FocusRecoveryState? {
        val startedAtMs = prefs.getLong(KEY_STARTED_AT_MS, 0L)
        val focusSessionId = prefs.getString(KEY_FOCUS_SESSION_ID, null).normalize()
        val scheduleId = prefs.getString(KEY_SCHEDULE_ID, null).normalize()
        if (startedAtMs <= 0L && focusSessionId == null && scheduleId == null) {
            return null
        }

        val stage = runCatching {
            FocusStage.valueOf(prefs.getString(KEY_STAGE, FocusStage.STOPPED.name).orEmpty())
        }.getOrDefault(FocusStage.STOPPED)

        return FocusRecoveryState(
            focusSessionId = focusSessionId,
            userId = prefs.getString(KEY_USER_ID, null).normalize(),
            scheduleId = scheduleId,
            scheduleName = prefs.getString(KEY_SCHEDULE_NAME, null).normalize(),
            startedAtMs = startedAtMs,
            stage = stage,
            lastMeaningfulProgressAtMs = prefs.getLong(KEY_LAST_MEANINGFUL_PROGRESS_AT_MS, 0L),
            lastRealtimePromptAtMs = prefs.getLong(KEY_LAST_REALTIME_PROMPT_AT_MS, 0L),
            snoozeRealtimeUntilAtMs = prefs.getLong(KEY_SNOOZE_REALTIME_UNTIL_AT_MS, 0L),
            lastLifecycleRecoveryEventAtMs = prefs.getLong(KEY_LAST_LIFECYCLE_RECOVERY_EVENT_AT_MS, 0L),
            lastProgressBlockedEventAtMs = prefs.getLong(KEY_LAST_PROGRESS_BLOCKED_EVENT_AT_MS, 0L),
            scheduleStartEventSent = prefs.getBoolean(KEY_SCHEDULE_START_EVENT_SENT, false),
            sensitivity = prefs.getString(KEY_SENSITIVITY, DEFAULT_SENSITIVITY).orEmpty().ifBlank { DEFAULT_SENSITIVITY },
            usageStatsEnabled = prefs.getBoolean(KEY_USAGE_STATS_ENABLED, false),
        )
    }

    fun save(state: FocusRecoveryState) {
        prefs.edit()
            .putString(KEY_FOCUS_SESSION_ID, state.focusSessionId)
            .putString(KEY_USER_ID, state.userId)
            .putString(KEY_SCHEDULE_ID, state.scheduleId)
            .putString(KEY_SCHEDULE_NAME, state.scheduleName)
            .putLong(KEY_STARTED_AT_MS, state.startedAtMs)
            .putString(KEY_STAGE, state.stage.name)
            .putLong(KEY_LAST_MEANINGFUL_PROGRESS_AT_MS, state.lastMeaningfulProgressAtMs)
            .putLong(KEY_LAST_REALTIME_PROMPT_AT_MS, state.lastRealtimePromptAtMs)
            .putLong(KEY_SNOOZE_REALTIME_UNTIL_AT_MS, state.snoozeRealtimeUntilAtMs)
            .putLong(KEY_LAST_LIFECYCLE_RECOVERY_EVENT_AT_MS, state.lastLifecycleRecoveryEventAtMs)
            .putLong(KEY_LAST_PROGRESS_BLOCKED_EVENT_AT_MS, state.lastProgressBlockedEventAtMs)
            .putBoolean(KEY_SCHEDULE_START_EVENT_SENT, state.scheduleStartEventSent)
            .putString(KEY_SENSITIVITY, state.sensitivity)
            .putBoolean(KEY_USAGE_STATS_ENABLED, state.usageStatsEnabled)
            .apply()
    }

    fun clear() {
        prefs.edit()
            .remove(KEY_FOCUS_SESSION_ID)
            .remove(KEY_USER_ID)
            .remove(KEY_SCHEDULE_ID)
            .remove(KEY_SCHEDULE_NAME)
            .remove(KEY_STARTED_AT_MS)
            .remove(KEY_STAGE)
            .remove(KEY_LAST_MEANINGFUL_PROGRESS_AT_MS)
            .remove(KEY_LAST_REALTIME_PROMPT_AT_MS)
            .remove(KEY_SNOOZE_REALTIME_UNTIL_AT_MS)
            .remove(KEY_LAST_LIFECYCLE_RECOVERY_EVENT_AT_MS)
            .remove(KEY_LAST_PROGRESS_BLOCKED_EVENT_AT_MS)
            .remove(KEY_SCHEDULE_START_EVENT_SENT)
            .remove(KEY_SENSITIVITY)
            .remove(KEY_USAGE_STATS_ENABLED)
            .apply()
    }

    fun update(transform: (FocusRecoveryState?) -> FocusRecoveryState?) {
        val updated = transform(load())
        if (updated == null) {
            clear()
        } else {
            save(updated)
        }
    }

    private fun String?.normalize(): String? = this?.trim()?.ifBlank { null }

    private companion object {
        private const val PREFS_NAME = "focus_recovery_store"
        private const val KEY_FOCUS_SESSION_ID = "focus_session_id"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_SCHEDULE_ID = "schedule_id"
        private const val KEY_SCHEDULE_NAME = "schedule_name"
        private const val KEY_STARTED_AT_MS = "started_at_ms"
        private const val KEY_STAGE = "stage"
        private const val KEY_LAST_MEANINGFUL_PROGRESS_AT_MS = "last_meaningful_progress_at_ms"
        private const val KEY_LAST_REALTIME_PROMPT_AT_MS = "last_realtime_prompt_at_ms"
        private const val KEY_SNOOZE_REALTIME_UNTIL_AT_MS = "snooze_realtime_until_at_ms"
        private const val KEY_LAST_LIFECYCLE_RECOVERY_EVENT_AT_MS = "last_lifecycle_recovery_event_at_ms"
        private const val KEY_LAST_PROGRESS_BLOCKED_EVENT_AT_MS = "last_progress_blocked_event_at_ms"
        private const val KEY_SCHEDULE_START_EVENT_SENT = "schedule_start_event_sent"
        private const val KEY_SENSITIVITY = "sensitivity"
        private const val KEY_USAGE_STATS_ENABLED = "usage_stats_enabled"
        private const val DEFAULT_SENSITIVITY = "normal"
    }
}
