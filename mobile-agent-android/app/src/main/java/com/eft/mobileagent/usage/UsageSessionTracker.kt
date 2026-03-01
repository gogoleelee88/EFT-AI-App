package com.eft.mobileagent.usage

data class AppUsageStat(
    val category: String,
    var seconds: Int = 0,
    var count: Int = 0,
)

class UsageSessionTracker {
    private val usage = linkedMapOf<String, AppUsageStat>()
    private var lastCategory: String? = null
    private var lastTsMs: Long = 0L
    private var switches: Int = 0

    fun reset(startAtMs: Long) {
        usage.clear()
        lastCategory = null
        lastTsMs = startAtMs
        switches = 0
    }

    fun onForeground(category: String, atMs: Long) {
        // Finalize previous segment first.
        lastCategory?.let { prev ->
            val deltaSec = ((atMs - lastTsMs) / 1000L).toInt().coerceAtLeast(0)
            val stat = usage.getOrPut(prev) { AppUsageStat(prev) }
            stat.seconds += deltaSec
        }

        val stat = usage.getOrPut(category) { AppUsageStat(category) }
        stat.count += 1

        if (lastCategory != null && lastCategory != category) switches += 1
        lastCategory = category
        lastTsMs = atMs
    }

    fun onCheckpoint(atMs: Long) {
        // Accumulate the current segment up to atMs.
        lastCategory?.let { cur ->
            val deltaSec = ((atMs - lastTsMs) / 1000L).toInt().coerceAtLeast(0)
            val stat = usage.getOrPut(cur) { AppUsageStat(cur) }
            stat.seconds += deltaSec
            lastTsMs = atMs
        }
    }

    fun buildSummaryTopN(n: Int = 6): List<AppUsageStat> {
        return usage.values
            .sortedByDescending { it.seconds }
            .take(n)
    }

    fun totalSeconds(): Int = usage.values.sumOf { it.seconds }

    fun externalSeconds(expectedCategory: String = "WorkTool"): Int =
        usage.values.filter { it.category != expectedCategory }.sumOf { it.seconds }

    fun switchCount(): Int = switches
}
