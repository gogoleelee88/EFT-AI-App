package com.eft.mobileagent.behavior.usage

class UsageSessionTracker {

    private val usageMap = mutableMapOf<String, AppUsageStat>()
    private var activeCategory: String? = null
    private var activeStartMs: Long = 0L
    private var switchCount = 0

    fun reset(startAtMs: Long) {
        usageMap.clear()
        activeCategory = null
        activeStartMs = startAtMs
        switchCount = 0
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
        activeStartMs = timestampMs
    }

    fun buildSummarySorted(): List<AppUsageStat> =
        usageMap.values.sortedByDescending { it.seconds }

    fun totalSeconds(): Int = usageMap.values.sumOf { it.seconds }

    fun externalSeconds(expected: String = "WorkTool"): Int =
        usageMap.values.filter { it.category != expected }.sumOf { it.seconds }

    fun getSwitchCount(): Int = switchCount
}
