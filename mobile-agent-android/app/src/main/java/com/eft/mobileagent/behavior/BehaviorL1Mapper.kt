package com.eft.mobileagent.behavior

import java.util.Calendar
import kotlin.math.sqrt

class BehaviorL1Mapper {
    fun map(window: MotionWindow, l0: L0Inference, screenOn: Boolean?): BehaviorInference {
        val l0Probs = normalizeL0(l0)
        val scores = L1_LABELS.associateWith { SCORE_EPS }.toMutableMap()
        val reasons = L1_LABELS.associateWith { mutableListOf<String>() }.toMutableMap()

        applyBasePriors(l0Probs, scores, reasons)
        applyContextRules(window, l0Probs, screenOn, scores, reasons)

        val l1Probs = normalizeScores(scores)
        val sorted = l1Probs.entries.sortedByDescending { it.value }
        val top1 = sorted.firstOrNull() ?: Pair("unknown_event", 1.0).toEntry()
        val top2 = sorted.getOrNull(1)
        val margin = (top1.value - (top2?.value ?: 0.0)).coerceIn(0.0, 1.0)

        val triggerReasons = mutableListOf<String>()
        if (top1.value < LOW_CONF_THRESHOLD) triggerReasons.add("low_confidence")
        if (margin < SMALL_MARGIN_THRESHOLD) triggerReasons.add("small_margin")
        if (top1.key == "unknown_event") triggerReasons.add("top1_unknown_event")
        if ((l0Probs["unknown"] ?: 0.0) >= 0.45) triggerReasons.add("l0_unknown_high")

        val topK = sorted.take(MAX_L1_TOPK).map { (label, confidence) ->
            L1TopKItem(label = label, confidence = confidence)
        }

        return BehaviorInference(
            l1Top1 = top1.key,
            confidence = top1.value,
            marginTop1Top2 = margin,
            topK = topK,
            triggerReasons = triggerReasons.distinct(),
        )
    }

    private fun normalizeL0(inference: L0Inference): Map<String, Double> {
        val raw = mutableMapOf<String, Double>()
        for (label in L0_LABELS) {
            raw[label] = 0.0
        }
        for ((label, score) in inference.probs) {
            if (label in raw) {
                raw[label] = score.coerceIn(0.0, 1.0)
            }
        }

        val total = raw.values.sum()
        if (total > 0.0) {
            return raw.mapValues { (_, v) -> v / total }
        }

        val out = raw.toMutableMap()
        val top1 = inference.top1.trim().lowercase()
        val conf = inference.confidence.coerceIn(0.0, 1.0)
        if (top1 in out) {
            out[top1] = conf
            out["unknown"] = (1.0 - conf).coerceIn(0.0, 1.0)
        } else {
            out["unknown"] = 1.0
        }
        return out
    }

    private fun applyBasePriors(
        l0: Map<String, Double>,
        scores: MutableMap<String, Double>,
        reasons: MutableMap<String, MutableList<String>>,
    ) {
        for ((l0Label, l0Prob) in l0) {
            val mapping = BASE_PRIORS_BY_L0[l0Label] ?: continue
            for ((l1Label, weight) in mapping) {
                addScore(scores, reasons, l1Label, l0Prob * weight, "from_l0:$l0Label")
            }
        }
    }

    private fun applyContextRules(
        window: MotionWindow,
        l0: Map<String, Double>,
        screenOn: Boolean?,
        scores: MutableMap<String, Double>,
        reasons: MutableMap<String, MutableList<String>>,
    ) {
        val movingProb = (l0["walk"] ?: 0.0) + (l0["upstairs"] ?: 0.0) + (l0["downstairs"] ?: 0.0)
        val stillProb = (l0["sit"] ?: 0.0) + (l0["stand"] ?: 0.0)
        val layProb = l0["lay"] ?: 0.0

        val mags = window.samples.map { sample ->
            sqrt((sample.x * sample.x + sample.y * sample.y + sample.z * sample.z).toDouble())
        }
        val mean = mags.average()
        val std = sqrt(mags.map { (it - mean) * (it - mean) }.average())

        val cal = Calendar.getInstance()
        val hour = cal.get(Calendar.HOUR_OF_DAY)
        val dayOfWeek = cal.get(Calendar.DAY_OF_WEEK)
        val isWeekend = dayOfWeek == Calendar.SATURDAY || dayOfWeek == Calendar.SUNDAY

        if (std >= 1.70) {
            addScore(scores, reasons, "workout", 0.30, "motion:very_high")
            addScore(scores, reasons, "commute", 0.18, "motion:very_high")
        } else if (std >= 0.90) {
            addScore(scores, reasons, "commute", 0.24, "motion:high")
            addScore(scores, reasons, "workout", 0.16, "motion:high")
        } else if (std < 0.25 && mean in 9.2..10.6) {
            addScore(scores, reasons, "sleep", 0.12, "motion:very_still")
        }

        if (((hour in 7..9) || (hour in 17..20)) && movingProb >= 0.25) {
            addScore(scores, reasons, "commute", 0.18, "hour:commute_window")
        }
        if (((hour in 11..13) || (hour in 18..20)) && stillProb >= 0.35) {
            addScore(scores, reasons, "meal", 0.16, "hour:meal_window")
        }
        if ((hour in 9..17) && !isWeekend && stillProb >= 0.40) {
            addScore(scores, reasons, "work_focus", 0.15, "hour:work_window")
        }
        if ((hour >= 22 || hour < 6) && (layProb >= 0.20 || stillProb >= 0.55)) {
            addScore(scores, reasons, "sleep", 0.28, "hour:night_window")
            addScore(scores, reasons, "relax", 0.10, "hour:night_wind_down")
        }

        if (screenOn == true && stillProb >= 0.45 && hour in 8..18) {
            addScore(scores, reasons, "work_focus", 0.14, "screen:on")
            addScore(scores, reasons, "meeting", 0.07, "screen:on")
        }
        if (screenOn == false && layProb >= 0.25) {
            addScore(scores, reasons, "sleep", 0.18, "screen:off")
        }

        if ((l0["unknown"] ?: 0.0) >= 0.45) {
            addScore(scores, reasons, "unknown_event", 0.30, "l0:unknown_high")
        }
        if (l0.values.maxOrNull() ?: 0.0 < 0.42) {
            addScore(scores, reasons, "unknown_event", 0.20, "l0:flat_distribution")
        }
    }

    private fun addScore(
        scores: MutableMap<String, Double>,
        reasons: MutableMap<String, MutableList<String>>,
        label: String,
        delta: Double,
        reason: String,
    ) {
        if (delta <= 0.0) return
        if (label !in scores) return
        scores[label] = (scores[label] ?: 0.0) + delta
        reasons[label]?.add(reason)
    }

    private fun normalizeScores(scores: Map<String, Double>): Map<String, Double> {
        val positive = scores.mapValues { (_, value) -> if (value > 0.0) value else 0.0 }
        val total = positive.values.sum()
        if (total <= 0.0) {
            return L1_LABELS.associateWith { if (it == "unknown_event") 1.0 else 0.0 }
        }
        return positive.mapValues { (_, value) -> value / total }
    }

    private fun <K, V> Pair<K, V>.toEntry(): Map.Entry<K, V> {
        return object : Map.Entry<K, V> {
            override val key: K = first
            override val value: V = second
        }
    }

    companion object {
        private const val SCORE_EPS = 1e-6
        private const val LOW_CONF_THRESHOLD = 0.62
        private const val SMALL_MARGIN_THRESHOLD = 0.12
        private const val MAX_L1_TOPK = 3

        private val L0_LABELS = listOf(
            "walk",
            "upstairs",
            "downstairs",
            "sit",
            "stand",
            "lay",
            "unknown",
        )

        private val L1_LABELS = listOf(
            "commute",
            "work_focus",
            "meeting",
            "workout",
            "meal",
            "chores",
            "relax",
            "sleep",
            "social",
            "unknown_event",
        )

        private val BASE_PRIORS_BY_L0: Map<String, Map<String, Double>> = mapOf(
            "walk" to mapOf(
                "commute" to 0.48,
                "workout" to 0.25,
                "chores" to 0.12,
                "social" to 0.05,
                "relax" to 0.05,
                "unknown_event" to 0.05,
            ),
            "upstairs" to mapOf(
                "commute" to 0.34,
                "workout" to 0.40,
                "chores" to 0.10,
                "social" to 0.03,
                "unknown_event" to 0.13,
            ),
            "downstairs" to mapOf(
                "commute" to 0.39,
                "workout" to 0.31,
                "chores" to 0.12,
                "social" to 0.03,
                "unknown_event" to 0.15,
            ),
            "sit" to mapOf(
                "work_focus" to 0.35,
                "meeting" to 0.22,
                "meal" to 0.13,
                "relax" to 0.12,
                "social" to 0.10,
                "sleep" to 0.03,
                "unknown_event" to 0.05,
            ),
            "stand" to mapOf(
                "work_focus" to 0.25,
                "meeting" to 0.20,
                "commute" to 0.12,
                "chores" to 0.18,
                "social" to 0.12,
                "meal" to 0.06,
                "unknown_event" to 0.07,
            ),
            "lay" to mapOf(
                "sleep" to 0.60,
                "relax" to 0.28,
                "social" to 0.03,
                "meal" to 0.01,
                "unknown_event" to 0.08,
            ),
            "unknown" to mapOf(
                "unknown_event" to 0.65,
                "relax" to 0.10,
                "social" to 0.08,
                "work_focus" to 0.06,
                "commute" to 0.04,
                "sleep" to 0.04,
                "chores" to 0.03,
            ),
        )
    }
}
