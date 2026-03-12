package com.eft.mobileagent.focus

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import com.eft.mobileagent.BuildConfig
import com.eft.mobileagent.alarm.AlarmJob
import com.eft.mobileagent.alarm.ReminderSyncManager
import com.eft.mobileagent.behavior.BehaviorAgentConfigStore
import com.eft.mobileagent.behavior.BehaviorAgentController
import com.eft.mobileagent.behavior.BehaviorApiClient
import com.eft.mobileagent.recovery.EftStrictIntakeBottomSheet
import com.eft.mobileagent.recovery.RecoveryInterventionHostActivity
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.net.URLEncoder
import java.util.Locale

internal const val MOBILE_AGENT_PREFS_NAME = "mobile_agent_prefs"
internal const val PREF_KEY_RECOVERY_SENSITIVITY = "recovery_sensitivity"
internal const val PREF_KEY_SCHEDULE_START_DELAY_MIN = "schedule_start_delay_min"
internal const val PREF_KEY_PROGRESS_BLOCKED_MIN = "progress_blocked_min"
internal const val PREF_KEY_USAGE_STATS_ENABLED = "usage_stats_enabled"
internal const val DEFAULT_SCHEDULE_START_DELAY_MIN = 3
internal const val DEFAULT_PROGRESS_BLOCKED_MIN = 8

internal data class FocusStartInputs(
    val baseUrl: String,
    val userId: String,
    val accessToken: String?,
)

internal data class RecoveryDispatchRequest(
    val entryPoint: String,
    val sessionState: String,
    val blockedMin: Int?,
    val distractionType: String?,
    val confidence: Double,
    val source: String,
)

internal data class RecoveryInterventionUi(
    val action: String,
    val recoveryUrl: String?,
    val entrySentence: String?,
)

internal data class FocusTimerConfig(
    val sensitivity: String,
    val scheduleStartDelayMinutes: Int,
    val progressBlockedMinutes: Int,
)

object FocusRecoveryCoordinator {
    fun startFromAlarmDismiss(context: Context, job: AlarmJob) {
        val appContext = context.applicationContext
        val scheduleId = resolveScheduleId(job)
        val scheduleName = resolveScheduleName(job.label)
        val inputs = resolveInputs(appContext)
        val timerConfig = loadTimerConfig(appContext)
        FocusRecoveryStore(appContext).save(
            FocusRecoveryState(
                focusSessionId = null,
                userId = inputs?.userId,
                scheduleId = scheduleId,
                scheduleName = scheduleName,
                startedAtMs = System.currentTimeMillis(),
                stage = FocusStage.ARMED_AFTER_ALARM,
                lastMeaningfulProgressAtMs = 0L,
                lastRealtimePromptAtMs = 0L,
                snoozeRealtimeUntilAtMs = 0L,
                lastLifecycleRecoveryEventAtMs = 0L,
                lastProgressBlockedEventAtMs = 0L,
                scheduleStartEventSent = false,
                sensitivity = timerConfig.sensitivity,
                usageStatsEnabled = isUsageStatsEnabled(appContext),
            ),
        )
        BehaviorAgentController.start(appContext)
        FocusRecoveryService.startTracking(appContext)
        if (inputs == null) return
        Thread {
            val focusSessionId = createRemoteFocusSession(
                inputs = inputs,
                scheduleId = scheduleId,
                scheduleType = "focus",
            )
            FocusRecoveryStore(appContext).update { current ->
                current?.copy(
                    focusSessionId = focusSessionId ?: current.focusSessionId,
                    userId = current.userId ?: inputs.userId,
                )
            }
        }.start()
    }

    fun startManual(
        context: Context,
        scheduleName: String?,
        scheduleId: String?,
    ) {
        val appContext = context.applicationContext
        val inputs = resolveInputs(appContext)
        val timerConfig = loadTimerConfig(appContext)
        FocusRecoveryStore(appContext).save(
            FocusRecoveryState(
                focusSessionId = null,
                userId = inputs?.userId,
                scheduleId = scheduleId?.trim()?.ifBlank { null },
                scheduleName = resolveScheduleName(scheduleName),
                startedAtMs = System.currentTimeMillis(),
                stage = FocusStage.WORKING,
                lastMeaningfulProgressAtMs = 0L,
                lastRealtimePromptAtMs = 0L,
                snoozeRealtimeUntilAtMs = 0L,
                lastLifecycleRecoveryEventAtMs = 0L,
                lastProgressBlockedEventAtMs = 0L,
                scheduleStartEventSent = false,
                sensitivity = timerConfig.sensitivity,
                usageStatsEnabled = isUsageStatsEnabled(appContext),
            ),
        )
        BehaviorAgentController.start(appContext)
        FocusRecoveryService.startTracking(appContext)
        if (inputs == null) return
        Thread {
            val focusSessionId = createRemoteFocusSession(
                inputs = inputs,
                scheduleId = scheduleId,
                scheduleType = "focus",
            )
            FocusRecoveryStore(appContext).update { current ->
                current?.copy(
                    focusSessionId = focusSessionId ?: current.focusSessionId,
                    userId = current.userId ?: inputs.userId,
                )
            }
        }.start()
    }

    fun stop(context: Context, reason: String) {
        FocusRecoveryService.stopTracking(context.applicationContext, reason)
    }

    fun restoreIfNeeded(context: Context) {
        val appContext = context.applicationContext
        val state = FocusRecoveryStore(appContext).load() ?: return
        if (state.stage == FocusStage.STOPPED) {
            FocusRecoveryStore(appContext).clear()
            return
        }
        FocusRecoveryService.restore(appContext)
    }

    fun markMeaningfulProgress(context: Context, source: String) {
        val appContext = context.applicationContext
        val now = System.currentTimeMillis()
        FocusRecoveryStore(appContext).update { current ->
            current?.copy(
                stage = FocusStage.WORKING,
                lastMeaningfulProgressAtMs = now,
            )
        }
        FocusRecoveryService.markProgress(appContext, source)
    }

    fun onProcessForegrounded(context: Context) {
        backgroundCheckHandler.removeCallbacksAndMessages(null)
        backgroundCheckRunnable = null
        processInForeground = true
    }

    fun onAppBackgrounded(context: Context) {
        val appContext = context.applicationContext
        backgroundCheckHandler.removeCallbacksAndMessages(null)
        backgroundCheckRunnable = null
        processInForeground = false

        val state = FocusRecoveryStore(appContext).load() ?: return
        val elapsed = System.currentTimeMillis() - state.startedAtMs
        val delayMs = (BACKGROUND_GRACE_MS - elapsed).coerceAtLeast(0L)
        val runnable = Runnable {
            backgroundCheckRunnable = null
            if (processInForeground) return@Runnable
            val current = FocusRecoveryStore(appContext).load() ?: return@Runnable
            val now = System.currentTimeMillis()
            if (now - current.lastLifecycleRecoveryEventAtMs < LIFECYCLE_RECOVERY_DEBOUNCE_MS) return@Runnable
            FocusRecoveryStore(appContext).update { latest ->
                latest?.copy(
                    stage = FocusStage.BLOCKED,
                    lastRealtimePromptAtMs = maxOf(latest.lastRealtimePromptAtMs, now),
                    lastLifecycleRecoveryEventAtMs = now,
                )
            }
            dispatchLifecycleRecovery(
                context = appContext,
                state = current,
                request = RecoveryDispatchRequest(
                    entryPoint = "distraction_detected",
                    sessionState = "in_progress",
                    blockedMin = null,
                    distractionType = "AppBackground",
                    confidence = 0.72,
                    source = "android_lifecycle",
                ),
            )
        }
        backgroundCheckRunnable = runnable
        backgroundCheckHandler.postDelayed(runnable, delayMs)
    }

    internal fun activeState(context: Context): FocusRecoveryState? =
        FocusRecoveryStore(context.applicationContext).load()

    internal fun postRecoveryEvent(
        context: Context,
        state: FocusRecoveryState,
        request: RecoveryDispatchRequest,
    ): RecoveryInterventionUi? {
        val appContext = context.applicationContext
        val fallback = buildFallbackIntervention(appContext, state, request)
        val inputs = resolveInputs(appContext) ?: return fallback
        val userId = state.userId ?: inputs.userId
        val client = BehaviorApiClient(baseUrl = inputs.baseUrl, accessToken = inputs.accessToken)
        val payload = JSONObject()
            .put("user_id", userId)
            .put("session_state", request.sessionState)
            .put("entry_point", request.entryPoint)
            .put("schedule_name", resolveScheduleName(state.scheduleName))
            .put("confidence", adjustedConfidence(request.confidence, state.sensitivity))
            .put("cooldown_minutes", recoveryCooldownMinutes(state.sensitivity))
            .put("source", request.source)
            .put("client_platform", "android")
            .put("ui_capability", "native_sheet")

        state.focusSessionId?.let { payload.put("focus_session_id", it) }
        state.scheduleId?.let { payload.put("schedule_id", it) }
        request.blockedMin?.let { payload.put("blocked_min", it) }
        request.distractionType?.takeIf { it.isNotBlank() }?.let { payload.put("distraction_type", it) }

        val response = runCatching {
            client.post(RECOVERY_EVENT_PATH, payload.toString())
        }.getOrNull() ?: return fallback
        if (response.statusCode !in 200..299) return fallback
        return parseRecoveryIntervention(response.body) ?: fallback
    }

    internal fun sendSessionSummary(
        context: Context,
        state: FocusRecoveryState,
        mismatchScore: Double,
        observedApps: JSONArray,
        distractionAppCategory: String?,
        durationRatio: Double,
        switchCount: Int,
    ) {
        val inputs = resolveInputs(context.applicationContext) ?: return
        val client = BehaviorApiClient(baseUrl = inputs.baseUrl, accessToken = inputs.accessToken)
        val payload = JSONObject()
            .put("user_id", state.userId ?: inputs.userId)
            .put("session_state", "in_progress")
            .put("entry_point", "session_summary")
            .put("schedule_name", resolveScheduleName(state.scheduleName))
            .put("confidence", adjustedConfidence(mismatchScore, state.sensitivity))
            .put("cooldown_minutes", recoveryCooldownMinutes(state.sensitivity))
            .put("source", "android_usage_stats")
            .put("mismatch_score", mismatchScore.coerceIn(0.0, 1.0))
            .put("observed_apps", observedApps)
            .put("context_version", "v2")
            .put("source_detail", "usage_events_pair")
            .put("summary_reason", "focus_session_end")
            .put("duration_ratio", durationRatio.coerceIn(0.0, 1.0))
            .put("switch_count", switchCount)

        state.focusSessionId?.let { payload.put("focus_session_id", it) }

        var unknownSec = 0
        var systemSec = 0
        var totalSec = 0
        for (i in 0 until observedApps.length()) {
            val obj = observedApps.optJSONObject(i) ?: continue
            val sec = obj.optInt("seconds", 0).coerceAtLeast(0)
            totalSec += sec
            when (obj.optString("category")) {
                "Unknown" -> unknownSec += sec
                "System" -> systemSec += sec
            }
        }
        val unknownRatio = if (totalSec > 0) unknownSec.toDouble() / totalSec.toDouble() else 0.0
        val systemRatio = if (totalSec > 0) systemSec.toDouble() / totalSec.toDouble() else 0.0
        payload
            .put("unknown_ratio", unknownRatio)
            .put("system_ratio", systemRatio)
            .put("top_categories", JSONArray().apply {
                val tops = linkedSetOf<String>()
                for (i in 0 until observedApps.length()) {
                    val obj = observedApps.optJSONObject(i) ?: continue
                    val cat = obj.optString("category").trim()
                    if (cat.isBlank() || cat == "WorkTool" || cat == "System") continue
                    tops.add(cat)
                    if (tops.size >= 3) break
                }
                tops.forEach { put(it) }
            })

        distractionAppCategory?.takeIf { it.isNotBlank() }?.let {
            payload.put("distraction_app_category", it)
        }

        runCatching { client.post(RECOVERY_EVENT_PATH, payload.toString()) }
    }

    internal fun stopRemoteFocusSession(context: Context, focusSessionId: String?) {
        if (focusSessionId.isNullOrBlank()) return
        val inputs = resolveInputs(context.applicationContext) ?: return
        val encodedUserId = URLEncoder.encode(inputs.userId, Charsets.UTF_8.name())
        val path = "/api/spec/focus-sessions/$focusSessionId/stop?user_id=$encodedUserId"
        runCatching {
            val client = BehaviorApiClient(baseUrl = inputs.baseUrl, accessToken = inputs.accessToken)
            client.post(path, "{}")
        }
    }

    internal fun submitStrictIntake(
        context: Context,
        payload: EftStrictIntakeBottomSheet.StrictIntakePayload,
    ): Boolean {
        val appContext = context.applicationContext
        val syncConfig = ReminderSyncManager.loadConfig(appContext)
        val stored = BehaviorAgentConfigStore(appContext).load()
        val baseUrl = syncConfig?.baseUrl ?: stored.backendBaseUrl
        val accessToken = BehaviorAgentConfigStore(appContext).loadAccessToken()?.trim()?.ifBlank { null }
            ?: stored.accessToken

        val body = JSONObject()
            .put("session_id", payload.sessionId)
            .put("session_type", payload.sessionType.ifBlank { "eftar" })
            .put("core_emotion", payload.coreEmotion)
            .put("situation_context", payload.situationContext)
            .put("automatic_thought", payload.automaticThought)
            .put("intensity_before", payload.intensityBefore)

        payload.userId?.trim()?.takeIf { it.isNotEmpty() }?.let { body.put("user_id", it) }
        payload.physicalSensation?.trim()?.takeIf { it.isNotEmpty() }?.let { body.put("physical_sensation", it) }
        payload.copingAttempt?.trim()?.takeIf { it.isNotEmpty() }?.let { body.put("coping_attempt", it) }
        payload.immediateGoal?.trim()?.takeIf { it.isNotEmpty() }?.let { body.put("immediate_goal", it) }

        val response = runCatching {
            val client = BehaviorApiClient(baseUrl = baseUrl, accessToken = accessToken)
            client.post("/api/emotion/checkin", body.toString())
        }.getOrNull() ?: return false

        return response.statusCode in 200..299
    }

    internal fun resolveInputs(context: Context): FocusStartInputs? {
        val appContext = context.applicationContext
        val savedConfig = ReminderSyncManager.loadConfig(appContext)
        val stored = BehaviorAgentConfigStore(appContext).load()
        val baseUrl = savedConfig?.baseUrl?.trim()?.ifBlank { null }
            ?: stored.backendBaseUrl.trim().ifBlank { null }
            ?: return null
        val parsed = runCatching { URI(baseUrl) }.getOrNull() ?: return null
        val scheme = parsed.scheme?.lowercase(Locale.US).orEmpty()
        val host = parsed.host?.lowercase(Locale.US).orEmpty()
        if ((scheme != "http" && scheme != "https") || host.isBlank()) return null

        val userId = savedConfig?.userId?.trim()?.ifBlank { null }
            ?: stored.userId?.trim()?.ifBlank { null }
            ?: return null
        val accessToken = BehaviorAgentConfigStore(appContext).loadAccessToken()?.trim()?.ifBlank { null }
            ?: stored.accessToken?.trim()?.ifBlank { null }

        return FocusStartInputs(
            baseUrl = baseUrl.removeSuffix("/"),
            userId = userId,
            accessToken = accessToken,
        )
    }

    internal fun loadTimerConfig(context: Context): FocusTimerConfig {
        val prefs = context.applicationContext.getSharedPreferences(MOBILE_AGENT_PREFS_NAME, Context.MODE_PRIVATE)
        val sensitivity = prefs.getString(PREF_KEY_RECOVERY_SENSITIVITY, "normal").orEmpty().ifBlank { "normal" }
        return FocusTimerConfig(
            sensitivity = sensitivity,
            scheduleStartDelayMinutes = prefs.getInt(PREF_KEY_SCHEDULE_START_DELAY_MIN, DEFAULT_SCHEDULE_START_DELAY_MIN)
                .coerceAtLeast(1),
            progressBlockedMinutes = prefs.getInt(PREF_KEY_PROGRESS_BLOCKED_MIN, DEFAULT_PROGRESS_BLOCKED_MIN)
                .coerceAtLeast(1),
        )
    }

    internal fun isUsageStatsEnabled(context: Context): Boolean {
        val prefs = context.applicationContext.getSharedPreferences(MOBILE_AGENT_PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getBoolean(PREF_KEY_USAGE_STATS_ENABLED, false)
    }

    internal fun resolveScheduleName(raw: String?): String =
        raw?.trim()?.takeIf { it.isNotEmpty() } ?: "업무 세션"

    private fun dispatchLifecycleRecovery(
        context: Context,
        state: FocusRecoveryState,
        request: RecoveryDispatchRequest,
    ) {
        val appContext = context.applicationContext
        Thread {
            val intervention = postRecoveryEvent(
                context = appContext,
                state = state,
                request = request,
            ) ?: return@Thread
            if (intervention.action !in setOf("open_native", "open_web")) return@Thread
            val current = FocusRecoveryStore(appContext).load() ?: state
            RecoveryInterventionHostActivity.openFromBackground(
                context = appContext,
                sessionId = current.focusSessionId ?: "android_recovery_${System.currentTimeMillis()}",
                userId = current.userId,
                entryPoint = request.entryPoint,
                scheduleName = current.scheduleName,
                focusSessionId = current.focusSessionId,
                distractionType = request.distractionType,
                blockedMin = request.blockedMin,
                entrySentence = intervention.entrySentence,
                recoveryUrl = intervention.recoveryUrl,
            )
        }.start()
    }

    private fun buildFallbackIntervention(
        context: Context,
        state: FocusRecoveryState,
        request: RecoveryDispatchRequest,
    ): RecoveryInterventionUi {
        val entrySentence = buildFallbackEntrySentence(request)
        val recoveryUrl = buildFallbackRecoveryUrl(context, state, request, entrySentence)
        return RecoveryInterventionUi(
            action = if (recoveryUrl.isNullOrBlank()) "open_native" else "open_web",
            recoveryUrl = recoveryUrl,
            entrySentence = entrySentence,
        )
    }

    private fun buildFallbackEntrySentence(request: RecoveryDispatchRequest): String {
        return when (request.entryPoint) {
            "schedule_start" -> "Your focus start slipped. What is blocking you right now?"
            "progress_blocked" -> "You have been stuck for a while. What is the blocker right now?"
            else -> when (request.distractionType) {
                "AppBackground" -> "You left the app. What pulled you away?"
                null -> "You drifted off schedule. What pulled you away?"
                else -> "A distraction was detected (${request.distractionType}). What pulled you away?"
            }
        }
    }

    private fun buildFallbackRecoveryUrl(
        context: Context,
        state: FocusRecoveryState,
        request: RecoveryDispatchRequest,
        entrySentence: String,
    ): String? {
        val candidateBases = LinkedHashSet<String>()
        BuildConfig.RECOVERY_WEB_BASE_URL.trim().ifBlank { null }?.let {
            candidateBases.add(it.removeSuffix("/"))
        }
        resolveInputs(context)?.baseUrl?.let { baseApiUrl ->
            candidateBases.addAll(buildRecoveryBaseCandidates(baseApiUrl))
        }
        val base = candidateBases.firstOrNull() ?: return null
        return Uri.parse(base)
            .buildUpon()
            .path(RECOVERY_PAGE_PATH)
            .appendQueryParameter("entry_point", request.entryPoint)
            .appendQueryParameter("session_state", request.sessionState)
            .appendQueryParameter("entry_sentence", entrySentence)
            .appendQueryParameter("schedule_name", state.scheduleName ?: "Focus session")
            .appendQueryParameter("schedule_id", state.scheduleId)
            .appendQueryParameter("focus_session_id", state.focusSessionId)
            .appendQueryParameter("distraction_type", request.distractionType)
            .apply {
                request.blockedMin?.let { appendQueryParameter("blocked_min", it.toString()) }
            }
            .build()
            .toString()
    }

    private fun buildRecoveryBaseCandidates(baseApiUrl: String): List<String> {
        val uri = runCatching { URI(baseApiUrl) }.getOrNull() ?: return emptyList()
        val scheme = uri.scheme ?: return emptyList()
        val host = uri.host ?: return emptyList()

        val ports = LinkedHashSet<String>()
        if (uri.port > 0) {
            ports.add(uri.port.toString())
        }
        ports.addAll(RECOVERY_WEB_PORT_CANDIDATES)

        return ports.map { port ->
            if (port == "80" && scheme.equals("http", ignoreCase = true)) {
                "$scheme://$host"
            } else if (port == "443" && scheme.equals("https", ignoreCase = true)) {
                "$scheme://$host"
            } else {
                "$scheme://$host:$port"
            }
        }
    }

    private fun createRemoteFocusSession(
        inputs: FocusStartInputs,
        scheduleId: String?,
        scheduleType: String,
    ): String? {
        val payload = JSONObject()
            .put("user_id", inputs.userId)
            .put("schedule_type", scheduleType)
            .put("auto_end_existing", true)
        scheduleId?.takeIf { it.isNotBlank() }?.let { payload.put("schedule_id", it) }

        val response = runCatching {
            val client = BehaviorApiClient(baseUrl = inputs.baseUrl, accessToken = inputs.accessToken)
            client.post("/api/spec/focus-sessions/start", payload.toString())
        }.getOrNull() ?: return null
        if (response.statusCode !in 200..299) return null
        return parseFocusSessionId(response.body)
    }

    private fun parseFocusSessionId(body: String): String? {
        val obj = runCatching { JSONObject(body) }.getOrNull() ?: return null
        return obj.optString("focus_session_id").orEmpty().ifBlank { null }
    }

    private fun parseRecoveryIntervention(body: String): RecoveryInterventionUi? {
        val obj = runCatching { JSONObject(body) }.getOrNull() ?: return null
        return RecoveryInterventionUi(
            action = obj.optString("action", "ignore").ifBlank { "ignore" },
            recoveryUrl = obj.optString("recovery_url").orEmpty().ifBlank { null },
            entrySentence = obj.optString("entry_sentence").orEmpty().ifBlank { null },
        )
    }

    private fun adjustedConfidence(base: Double, sensitivity: String): Double {
        return when (sensitivity) {
            "sensitive" -> (base - 0.12).coerceAtLeast(0.40)
            "relaxed" -> (base + 0.10).coerceAtMost(0.95)
            else -> base
        }
    }

    private fun recoveryCooldownMinutes(sensitivity: String): Int {
        return when (sensitivity) {
            "sensitive" -> 5
            "relaxed" -> 12
            else -> 8
        }
    }

    private fun resolveScheduleId(job: AlarmJob): String? {
        val taskUid = job.taskUid.trim()
        if (taskUid.isNotEmpty()) return taskUid
        return job.alarmId.trim().ifBlank { null }
    }

    private val backgroundCheckHandler = Handler(Looper.getMainLooper())

    @Volatile
    private var backgroundCheckRunnable: Runnable? = null

    @Volatile
    private var processInForeground: Boolean = true

    private const val BACKGROUND_GRACE_MS = 20_000L
    private const val LIFECYCLE_RECOVERY_DEBOUNCE_MS = 60_000L
    private const val RECOVERY_PAGE_PATH = "/eft-strict"
    private val RECOVERY_WEB_PORT_CANDIDATES = listOf("8787", "4173", "5173", "80", "443")
    private const val RECOVERY_EVENT_PATH = "/api/spec/recovery/events"
}
