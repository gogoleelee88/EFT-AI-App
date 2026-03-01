package com.eft.mobileagent.behavior.usage

object AdvancedMismatch {
    // WorkTool = expected, Browser/Unknown = neutral, others = disallowed.
    private fun categoryScore(category: String): Float = when (category) {
        "WorkTool" -> 0f
        "Browser" -> 0.5f
        "SNS" -> 1.0f
        "YouTube" -> 1.0f
        "Other" -> 1.0f
        "Unknown" -> 0.5f
        else -> 0.8f
    }

    fun evaluate(
        focusSessionStartedAt: Long,
        focusSessionEndedAt: Long,
        observed: List<AppUsageStat>,
        switchCount: Int,
        hasMeaningfulProgress: Boolean,
        lastMeaningfulProgressAt: Long,
    ): Double {
        val normalized = observed
            .filter { it.category != "System" } // allowlist excluded
            .map { it.copy() }

        // Browser can be treated as WorkTool for doc/dev heavy sessions.
        val treatBrowserAsWork = AppCategoryMapper.shouldTreatBrowserAsWork(normalized)
        val normalizedCats = if (treatBrowserAsWork) {
            normalized.map { if (it.category == "Browser") it.copy(category = "WorkTool") else it }
        } else {
            normalized
        }

        val totalSeconds = normalizedCats.sumOf { it.seconds }.coerceAtLeast(0)
        if (totalSeconds <= 0) return 0.0

        // duration_ratio = external_seconds / total
        val externalSeconds = normalizedCats.filter { it.category != "WorkTool" }.sumOf { it.seconds }
        val durationRatio = (externalSeconds.toFloat() / totalSeconds.toFloat()).coerceIn(0f, 1f)

        // switch_density = switches / total_minutes
        val totalMinutes = (totalSeconds / 60f).coerceAtLeast(1f)
        val switchDensityRaw = switchCount.toFloat() / totalMinutes
        val switchDensity = (switchDensityRaw / 3f).coerceIn(0f, 1f)

        // start_delay_score = minutes until first meaningful progress
        val now = focusSessionEndedAt
        val startDelayMin = if (!hasMeaningfulProgress) {
            ((now - focusSessionStartedAt) / 60_000L).toFloat().coerceAtLeast(0f)
        } else {
            0f
        }
        val startDelayScore = (startDelayMin / 10f).coerceIn(0f, 1f)

        // idle_score = idle_minutes / 10 (clamped)
        val idleMin = if (hasMeaningfulProgress) {
            ((now - lastMeaningfulProgressAt) / 60_000L).toFloat().coerceAtLeast(0f)
        } else {
            startDelayMin
        }
        val idleScore = (idleMin / 10f).coerceIn(0f, 1f)

        // category_score = score of the top external category by seconds
        val topExternal = normalizedCats
            .filter { it.category != "WorkTool" }
            .maxByOrNull { it.seconds }
            ?.category ?: "WorkTool"
        val categoryScore = categoryScore(topExternal)

        val score =
            0.35f * categoryScore +
            0.25f * durationRatio +
            0.15f * switchDensity +
            0.15f * startDelayScore +
            0.10f * idleScore

        return score.coerceIn(0f, 1f).toDouble()
    }
}
