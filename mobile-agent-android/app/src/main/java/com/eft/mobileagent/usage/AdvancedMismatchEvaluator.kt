package com.eft.mobileagent.usage

object AdvancedMismatchEvaluator {
    fun evaluate(
        categoryScore: Float,
        durationRatio: Float,
        switchDensity: Float,
        startDelay: Float,
        idleScore: Float,
    ): Float {
        val score = 0.35f * categoryScore +
            0.25f * durationRatio +
            0.15f * switchDensity +
            0.15f * startDelay +
            0.10f * idleScore
        return score.coerceIn(0f, 1f)
    }
}
