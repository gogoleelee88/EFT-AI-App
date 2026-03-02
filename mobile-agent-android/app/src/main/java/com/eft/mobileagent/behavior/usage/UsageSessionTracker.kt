package com.eft.mobileagent.behavior.usage

class UsageSessionTracker {

    private val usageMap = mutableMapOf<String, AppUsageStat>()
    private var activeCategory: String? = null
    private var activeStartMs: Long = 0L
    private var switchCount = 0

    private data class Segment(
        val category: String,
        val startMs: Long,
        val endMs: Long,
    )

    // Keep only recent segments to compute "recent window" summaries.
    private val segments: ArrayDeque<Segment> = ArrayDeque()
    private var sessionStartMs: Long = 0L

    fun reset(startAtMs: Long) {
        usageMap.clear()
        activeCategory = null
        activeStartMs = startAtMs
        switchCount = 0
        segments.clear()
        sessionStartMs = startAtMs
    }

    /** Called when we are sure foreground changed at timestampMs. */
    fun onForeground(category: String, timestampMs: Long) {
        // Close previous segment.
        closeActiveSegment(timestampMs)

        // Open new segment.
        if (activeCategory != category && activeCategory != null) {
            switchCount++
        }

        val stat = usageMap.getOrPut(category) { AppUsageStat(category) }
        stat.count += 1

        activeCategory = category
        activeStartMs = timestampMs
    }

    /** Called on background/pause to close current foreground segment. */
    fun onBackground(timestampMs: Long) {
        closeActiveSegment(timestampMs)
        activeCategory = null
        activeStartMs = timestampMs
    }

    /** If session ends, call this to close the last segment using end time. */
    fun finalizeTo(timestampMs: Long) {
        closeActiveSegment(timestampMs)
    }

    private fun closeActiveSegment(timestampMs: Long) {
        val cat = activeCategory ?: return
        if (timestampMs <= activeStartMs) return
        val deltaSec = ((timestampMs - activeStartMs) / 1000L).toInt().coerceAtLeast(0)
        val stat = usageMap.getOrPut(cat) { AppUsageStat(cat) }
        stat.seconds += deltaSec

        // Save segment for recent-window analysis.
        segments.addLast(Segment(category = cat, startMs = activeStartMs, endMs = timestampMs))
        trimSegments(timestampMs)

        activeStartMs = timestampMs
    }

    fun buildSummarySorted(): List<AppUsageStat> =
        usageMap.values.sortedByDescending { it.seconds }

    fun totalSeconds(): Int = usageMap.values.sumOf { it.seconds }

    fun externalSeconds(expected: String = "WorkTool"): Int =
        usageMap.values.filter { it.category != expected }.sumOf { it.seconds }

    fun getSwitchCount(): Int = switchCount

    fun currentCategory(): String? = activeCategory

    /**
     * Compute a category summary within a recent time window.
     * Returns seconds + count (approx count by segments overlapping window).
     */
    fun recentSummary(windowMs: Long, nowMs: Long): List<AppUsageStat> {
        if (windowMs <= 0L) return emptyList()
        val start = (nowMs - windowMs).coerceAtLeast(sessionStartMs)

        // Ensure last open segment is closed up to nowMs for accurate window numbers.
        // This does not clear activeCategory, it only adds a segment boundary.
        if (activeCategory != null && nowMs > activeStartMs) {
            val cat = activeCategory!!
            val startMs = activeStartMs
            segments.addLast(Segment(category = cat, startMs = startMs, endMs = nowMs))
            trimSegments(nowMs)
            // Re-open from now
            activeStartMs = nowMs
        }

        val map = mutableMapOf<String, AppUsageStat>()
        for (seg in segments) {
            val overlapStart = maxOf(seg.startMs, start)
            val overlapEnd = minOf(seg.endMs, nowMs)
            if (overlapEnd <= overlapStart) continue
            val sec = ((overlapEnd - overlapStart) / 1000L).toInt().coerceAtLeast(0)
            if (sec <= 0) continue
            val stat = map.getOrPut(seg.category) { AppUsageStat(seg.category) }
            stat.seconds += sec
            stat.count += 1
        }
        return map.values.sortedByDescending { it.seconds }
    }

    private fun trimSegments(nowMs: Long) {
        // Keep up to last 12 minutes worth of data.
        val keepAfter = nowMs - 12 * 60_000L
        while (segments.isNotEmpty()) {
            val first = segments.first()
            if (first.endMs >= keepAfter) break
            segments.removeFirst()
        }
        // Hard-cap.
        while (segments.size > 600) {
            segments.removeFirst()
        }
    }
}
