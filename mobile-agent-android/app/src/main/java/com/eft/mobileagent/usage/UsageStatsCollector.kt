package com.eft.mobileagent.usage

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context

class UsageStatsCollector(private val context: Context) {
    private var lastQueryMs: Long = 0L

    fun reset(startAtMs: Long) {
        lastQueryMs = startAtMs
    }

    /**
     * Pull usage events since lastQueryMs -> nowMs and feed tracker.
     * Returns the last foreground category observed.
     */
    fun collectInto(
        tracker: UsageSessionTracker,
        nowMs: Long,
    ): String? {
        if (!UsageAccessGate.hasUsageAccess(context)) return null
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

        val start = lastQueryMs
        val end = nowMs
        if (end <= start) return null

        val events: UsageEvents = usm.queryEvents(start, end)
        val e = UsageEvents.Event()

        var lastForegroundPkg: String? = null
        while (events.hasNextEvent()) {
            events.getNextEvent(e)
            if (e.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                lastForegroundPkg = e.packageName
                val category = AppCategoryMapper.toCategory(e.packageName)
                tracker.onForeground(category, e.timeStamp)
            }
        }

        tracker.onCheckpoint(end)
        lastQueryMs = end

        return lastForegroundPkg?.let { AppCategoryMapper.toCategory(it) }
    }
}
