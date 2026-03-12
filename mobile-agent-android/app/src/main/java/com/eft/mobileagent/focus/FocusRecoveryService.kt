package com.eft.mobileagent.focus

import android.app.AppOpsManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.eft.mobileagent.MainActivity
import com.eft.mobileagent.R
import com.eft.mobileagent.behavior.usage.AdvancedMismatch
import com.eft.mobileagent.behavior.usage.AppCategoryMapper
import com.eft.mobileagent.behavior.usage.AppUsageStat
import com.eft.mobileagent.behavior.usage.UsageSessionTracker
import com.eft.mobileagent.behavior.usage.UsageStatsPoller
import com.eft.mobileagent.recovery.RecoveryInterventionHostActivity
import org.json.JSONArray
import org.json.JSONObject

class FocusRecoveryService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var store: FocusRecoveryStore
    private var usageTracker: UsageSessionTracker? = null
    private var usagePoller: UsageStatsPoller? = null
    private var timerRunnable: Runnable? = null

    @Volatile
    private var promptInFlight = false

    override fun onCreate() {
        super.onCreate()
        store = FocusRecoveryStore(applicationContext)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        ensureForeground()
        when (intent?.action) {
            ACTION_START_TRACKING,
            ACTION_RESTORE -> handleStartOrRestore()
            ACTION_STOP_TRACKING -> handleStopTracking()
            ACTION_MARK_PROGRESS -> handleMarkProgress()
            ACTION_APP_BACKGROUNDED -> handleAppBackgrounded()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        stopUsageMonitoring()
        stopTimerLoop()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun handleStartOrRestore() {
        val state = store.load()
        if (state == null || state.stage == FocusStage.STOPPED) {
            stopSelfSafely()
            return
        }
        configureUsageMonitoring(state)
        startTimerLoop()
        ensureForeground()
    }

    private fun handleStopTracking() {
        val state = store.load()
        if (state != null) {
            sendSessionSummary(state)
            Thread {
                FocusRecoveryCoordinator.stopRemoteFocusSession(applicationContext, state.focusSessionId)
            }.start()
        }
        stopUsageMonitoring()
        stopTimerLoop()
        store.clear()
        stopSelfSafely()
    }

    private fun handleMarkProgress() {
        if (store.load() != null && timerRunnable == null) {
            handleStartOrRestore()
        }
    }

    private fun handleAppBackgrounded() {
        val state = store.load() ?: return
        val now = System.currentTimeMillis()
        if (now - state.startedAtMs < BACKGROUND_GRACE_MS) return
        if (now - state.lastLifecycleRecoveryEventAtMs < LIFECYCLE_RECOVERY_DEBOUNCE_MS) return
        store.update { current ->
            current?.copy(lastLifecycleRecoveryEventAtMs = now)
        }
        dispatchRecoveryEvent(
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

    private fun configureUsageMonitoring(state: FocusRecoveryState) {
        stopUsageMonitoring()
        if (!state.usageStatsEnabled || !hasUsageAccessGranted()) {
            usageTracker = null
            usagePoller = null
            return
        }
        usageTracker = UsageSessionTracker().apply {
            reset(state.startedAtMs)
        }
        usagePoller = UsageStatsPoller(
            context = applicationContext,
            tracker = usageTracker!!,
        ) { recentSummary, nowMs ->
            maybePromptRealtimeDistraction(recentSummary, nowMs)
        }
        usagePoller?.start()
    }

    private fun stopUsageMonitoring() {
        runCatching { usagePoller?.stop() }
        usagePoller = null
        usageTracker = null
    }

    private fun startTimerLoop() {
        if (timerRunnable != null) return
        timerRunnable = object : Runnable {
            override fun run() {
                evaluateRecoveryTimerTick()
                handler.postDelayed(this, RECOVERY_TIMER_TICK_MS)
            }
        }
        handler.postDelayed(timerRunnable!!, RECOVERY_TIMER_TICK_MS)
    }

    private fun stopTimerLoop() {
        timerRunnable?.let { handler.removeCallbacks(it) }
        timerRunnable = null
    }

    private fun evaluateRecoveryTimerTick() {
        val state = store.load() ?: return
        val timerConfig = FocusRecoveryCoordinator.loadTimerConfig(applicationContext)
        val now = System.currentTimeMillis()
        val elapsed = now - state.startedAtMs

        if (!state.scheduleStartEventSent && state.lastMeaningfulProgressAtMs <= 0L) {
            val scheduleStartDelayMs = timerConfig.scheduleStartDelayMinutes * 60_000L
            if (elapsed >= scheduleStartDelayMs) {
                store.update { current ->
                    current?.copy(scheduleStartEventSent = true)
                }
                dispatchRecoveryEvent(
                    request = RecoveryDispatchRequest(
                        entryPoint = "schedule_start",
                        sessionState = "start",
                        blockedMin = (elapsed / 60_000L).toInt().coerceAtLeast(1),
                        distractionType = null,
                        confidence = 0.66,
                        source = "android_timer_start",
                    ),
                )
            }
        }

        if (state.lastMeaningfulProgressAtMs <= 0L) return
        val blockedMs = now - state.lastMeaningfulProgressAtMs
        val progressBlockedDelayMs = timerConfig.progressBlockedMinutes * 60_000L
        if (blockedMs < progressBlockedDelayMs) return
        if (now - state.lastProgressBlockedEventAtMs < PROGRESS_BLOCKED_REPEAT_MS) return
        store.update { current ->
            current?.copy(lastProgressBlockedEventAtMs = now)
        }
        dispatchRecoveryEvent(
            request = RecoveryDispatchRequest(
                entryPoint = "progress_blocked",
                sessionState = "in_progress",
                blockedMin = (blockedMs / 60_000L).toInt().coerceAtLeast(1),
                distractionType = null,
                confidence = 0.68,
                source = "android_timer_progress",
            ),
        )
    }

    private fun maybePromptRealtimeDistraction(
        recent: List<AppUsageStat>,
        nowMs: Long,
    ) {
        val state = store.load() ?: return
        if (promptInFlight) return
        if (nowMs < state.snoozeRealtimeUntilAtMs) return
        if (nowMs - state.lastRealtimePromptAtMs < REALTIME_PROMPT_COOLDOWN_MS) return

        val thresholdSeconds = if (state.stage == FocusStage.ARMED_AFTER_ALARM) {
            if (nowMs - state.startedAtMs < ARMED_DISTRACTION_GRACE_MS) return
            ARMED_MIN_EXTERNAL_SECONDS
        } else {
            REALTIME_MIN_EXTERNAL_SECONDS
        }

        val treatBrowserAsWork = AppCategoryMapper.shouldTreatBrowserAsWork(recent)
        val topExternal = recent.firstOrNull { stat ->
            when (stat.category) {
                "WorkTool", "System" -> false
                "Browser" -> !treatBrowserAsWork
                else -> true
            }
        } ?: return

        if (topExternal.seconds < thresholdSeconds) return
        if (topExternal.category !in setOf("YouTube", "SNS", "Other")) return

        store.update { current ->
            current?.copy(
                lastRealtimePromptAtMs = nowMs,
                stage = FocusStage.BLOCKED,
            )
        }
        dispatchRecoveryEvent(
            request = RecoveryDispatchRequest(
                entryPoint = "distraction_detected",
                sessionState = "in_progress",
                blockedMin = null,
                distractionType = topExternal.category,
                confidence = 0.74,
                source = "android_usage_realtime",
            ),
        )
    }

    private fun dispatchRecoveryEvent(request: RecoveryDispatchRequest) {
        val state = store.load() ?: return
        if (promptInFlight) return
        promptInFlight = true
        Thread {
            try {
                val intervention = FocusRecoveryCoordinator.postRecoveryEvent(
                    context = applicationContext,
                    state = state,
                    request = request,
                )
                if (intervention != null && intervention.action in setOf("open_native", "open_web")) {
                    val current = store.load() ?: state
                    RecoveryInterventionHostActivity.openFromBackground(
                        context = applicationContext,
                        sessionId = current.focusSessionId ?: "android_recovery_${System.currentTimeMillis()}",
                        userId = current.userId,
                        entryPoint = request.entryPoint,
                        scheduleName = current.scheduleName,
                        focusSessionId = current.focusSessionId,
                        distractionType = request.distractionType,
                        blockedMin = request.blockedMin,
                        entrySentence = intervention.entrySentence,
                    )
                }
            } finally {
                promptInFlight = false
            }
        }.start()
    }

    private fun sendSessionSummary(state: FocusRecoveryState) {
        val tracker = usageTracker ?: return
        runCatching {
            usagePoller?.forcePollNow()
            usagePoller?.stop()
            tracker.finalizeTo(System.currentTimeMillis())

            val summary = tracker.buildSummarySorted()
            if (summary.isEmpty()) return

            val now = System.currentTimeMillis()
            val mismatchScore = AdvancedMismatch.evaluate(
                focusSessionStartedAt = state.startedAtMs,
                focusSessionEndedAt = now,
                observed = summary,
                switchCount = tracker.getSwitchCount(),
                hasMeaningfulProgress = state.lastMeaningfulProgressAtMs > 0L,
                lastMeaningfulProgressAt = state.lastMeaningfulProgressAtMs.takeIf { it > 0L } ?: state.startedAtMs,
            )
            val observedJson = JSONArray()
            for (item in summary.take(10)) {
                observedJson.put(
                    JSONObject()
                        .put("category", item.category)
                        .put("seconds", item.seconds)
                        .put("count", item.count),
                )
            }
            val topDistraction = summary.firstOrNull {
                it.category != "WorkTool" && it.category != "System"
            }?.category
            val totalSeconds = summary.sumOf { it.seconds }.coerceAtLeast(1)
            val externalSeconds = summary.filter { it.category != "WorkTool" }.sumOf { it.seconds }
            val durationRatio = externalSeconds.toDouble() / totalSeconds.toDouble()
            FocusRecoveryCoordinator.sendSessionSummary(
                context = applicationContext,
                state = state,
                mismatchScore = mismatchScore,
                observedApps = observedJson,
                distractionAppCategory = topDistraction,
                durationRatio = durationRatio,
                switchCount = tracker.getSwitchCount(),
            )
        }
    }

    private fun ensureForeground() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(
                NotificationChannel(
                    NOTIFICATION_CHANNEL_ID,
                    "Focus recovery",
                    NotificationManager.IMPORTANCE_LOW,
                ),
            )
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(getString(R.string.app_name))
            .setContentText("Focus recovery monitoring is active.")
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
        startForeground(NOTIFICATION_ID, notification)
    }

    private fun stopSelfSafely() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    private fun hasUsageAccessGranted(): Boolean {
        val appOps = getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                packageName,
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                packageName,
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    companion object {
        private const val ACTION_START_TRACKING = "com.eft.mobileagent.focus.action.START_TRACKING"
        private const val ACTION_STOP_TRACKING = "com.eft.mobileagent.focus.action.STOP_TRACKING"
        private const val ACTION_RESTORE = "com.eft.mobileagent.focus.action.RESTORE"
        private const val ACTION_MARK_PROGRESS = "com.eft.mobileagent.focus.action.MARK_PROGRESS"
        private const val ACTION_APP_BACKGROUNDED = "com.eft.mobileagent.focus.action.APP_BACKGROUNDED"
        private const val NOTIFICATION_CHANNEL_ID = "focus_recovery"
        private const val NOTIFICATION_ID = 44021
        private const val RECOVERY_TIMER_TICK_MS = 60_000L
        private const val PROGRESS_BLOCKED_REPEAT_MS = 10 * 60_000L
        private const val LIFECYCLE_RECOVERY_DEBOUNCE_MS = 60_000L
        private const val REALTIME_PROMPT_COOLDOWN_MS = 5 * 60_000L
        private const val REALTIME_MIN_EXTERNAL_SECONDS = 45
        private const val ARMED_MIN_EXTERNAL_SECONDS = 20
        private const val ARMED_DISTRACTION_GRACE_MS = 20_000L
        private const val BACKGROUND_GRACE_MS = 20_000L

        fun startTracking(context: Context) {
            val intent = Intent(context, FocusRecoveryService::class.java).setAction(ACTION_START_TRACKING)
            ContextCompat.startForegroundService(context, intent)
        }

        fun stopTracking(context: Context, reason: String) {
            val intent = Intent(context, FocusRecoveryService::class.java)
                .setAction(ACTION_STOP_TRACKING)
                .putExtra("reason", reason)
            ContextCompat.startForegroundService(context, intent)
        }

        fun restore(context: Context) {
            val intent = Intent(context, FocusRecoveryService::class.java).setAction(ACTION_RESTORE)
            ContextCompat.startForegroundService(context, intent)
        }

        fun markProgress(context: Context, source: String) {
            val intent = Intent(context, FocusRecoveryService::class.java)
                .setAction(ACTION_MARK_PROGRESS)
                .putExtra("source", source)
            ContextCompat.startForegroundService(context, intent)
        }

        fun onAppBackgrounded(context: Context) {
            val intent = Intent(context, FocusRecoveryService::class.java).setAction(ACTION_APP_BACKGROUNDED)
            ContextCompat.startForegroundService(context, intent)
        }
    }
}
