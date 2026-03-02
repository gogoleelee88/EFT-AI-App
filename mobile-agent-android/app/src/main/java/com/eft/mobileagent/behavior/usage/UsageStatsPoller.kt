package com.eft.mobileagent.behavior.usage

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper

class UsageStatsPoller(
    private val context: Context,
    private val tracker: UsageSessionTracker,
    private val onAfterPoll: ((recentSummary: List<AppUsageStat>, nowMs: Long) -> Unit)? = null,
) {
    private val handler = Handler(Looper.getMainLooper())
    private var running = false
    private var lastQueryAt: Long = 0L

    private val tick = object : Runnable {
        override fun run() {
            if (!running) return
            pollOnce()
            handler.postDelayed(this, 5_000L) // event-based, but still batched
        }
    }

    fun start() {
        if (running) return
        running = true
        val now = System.currentTimeMillis()
        // Backfill a tiny window to catch the current foreground.
        lastQueryAt = now - 10_000L
        handler.post(tick)
    }

    fun stop() {
        running = false
        handler.removeCallbacks(tick)
    }

    fun forcePollNow() {
        pollOnce()
    }

    private fun pollOnce() {
        val now = System.currentTimeMillis()
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val events = usm.queryEvents(lastQueryAt, now)

        val evt = UsageEvents.Event()

        while (events.hasNextEvent()) {
            events.getNextEvent(evt)
            val ts = evt.timeStamp
            val pkg = evt.packageName

            // API 29+ gives ACTIVITY_RESUMED/PAUSED which is more precise.
            val isResume =
                (Build.VERSION.SDK_INT >= 29 && evt.eventType == UsageEvents.Event.ACTIVITY_RESUMED) ||
                    (evt.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND)
            val isPause =
                (Build.VERSION.SDK_INT >= 29 && evt.eventType == UsageEvents.Event.ACTIVITY_PAUSED) ||
                    (evt.eventType == UsageEvents.Event.MOVE_TO_BACKGROUND)

            if (isResume) {
                val cat = AppCategoryMapper.map(pkg)
                tracker.onForeground(cat, ts)
            } else if (isPause) {
                tracker.onBackground(ts)
            }
        }

        // Close open segment up to now (prevents time gaps).
        tracker.finalizeTo(now)
        lastQueryAt = now

        // Emit recent window summary for realtime nudge engine.
        onAfterPoll?.invoke(tracker.recentSummary(windowMs = 90_000L, nowMs = now), now)
    }
}
