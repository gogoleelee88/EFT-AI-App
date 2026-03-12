package com.eft.mobileagent.recovery

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.eft.mobileagent.BuildConfig
import com.eft.mobileagent.R
import com.google.android.material.appbar.MaterialToolbar

class RecoveryPlanActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_recovery_plan)

        val toolbar = findViewById<MaterialToolbar>(R.id.recoveryPlanToolbar)
        toolbar.setNavigationOnClickListener { finish() }

        val coreEmotion = intent.getStringExtra(EXTRA_CORE_EMOTION).orEmpty()
        val situation = intent.getStringExtra(EXTRA_SITUATION_CONTEXT).orEmpty()
        val automaticThought = intent.getStringExtra(EXTRA_AUTOMATIC_THOUGHT).orEmpty()
        val intensity = intent.getIntExtra(EXTRA_INTENSITY_BEFORE, 6).coerceIn(0, 10)
        val plan = ExecutionRecoveryPlanner.build(coreEmotion, situation)

        findViewById<TextView>(R.id.recoveryPlanPill).text =
            "${plan.emotionLabel} / ${plan.frictionLabel}"
        findViewById<TextView>(R.id.recoveryPlanTitle).text = plan.resetMessage
        findViewById<TextView>(R.id.recoveryPlanDetail).text = plan.resetDetail
        findViewById<TextView>(R.id.recoveryPlanMoment).text =
            listOf(coreEmotion, situation, automaticThought)
                .filter { it.isNotBlank() }
                .joinToString(" / ")

        findViewById<TextView>(R.id.recoveryPlanEftTitle).text = plan.eftRecommendation.title
        findViewById<TextView>(R.id.recoveryPlanEftSubtitle).text = plan.eftRecommendation.subtitle
        findViewById<TextView>(R.id.recoveryPlanEftPoints).text = plan.eftTappingPoints.joinToString(" -> ")
        findViewById<TextView>(R.id.recoveryPlanEftMeta).text =
            "${plan.eftRecommendation.actionLabel} / ${plan.eftRecommendation.durationLabel}"

        findViewById<TextView>(R.id.recoveryPlanMeditationTitle).text = plan.meditationRecommendation.title
        findViewById<TextView>(R.id.recoveryPlanMeditationSubtitle).text = plan.meditationRecommendation.subtitle
        findViewById<Button>(R.id.recoveryPlanMeditationButton).apply {
            text = "${plan.meditationRecommendation.actionLabel} / ${plan.meditationRecommendation.durationLabel}"
            setOnClickListener { openExternal(plan.meditationRecommendation.href) }
        }

        findViewById<TextView>(R.id.recoveryPlanBattleTitle).text = plan.battleModeRecommendation.title
        findViewById<TextView>(R.id.recoveryPlanBattleSubtitle).text = plan.battleModeRecommendation.subtitle
        findViewById<TextView>(R.id.recoveryPlanBattleTrack).text = plan.battleModeTrackLabel
        findViewById<Button>(R.id.recoveryPlanBattleButton).apply {
            text = "${plan.battleModeRecommendation.actionLabel} / ${plan.battleModeRecommendation.durationLabel}"
            setOnClickListener { openExternal(plan.battleModeRecommendation.href) }
        }

        findViewById<TextView>(R.id.recoveryPlanMicroAction).text = plan.microAction.instruction
        findViewById<TextView>(R.id.recoveryPlanDoneWhen).text = plan.microAction.doneWhen
        findViewById<TextView>(R.id.recoveryPlanNextMove).text = plan.microAction.nextInstruction

        findViewById<Button>(R.id.recoveryPlanEftarButton).setOnClickListener {
            openEftar(intensity)
        }
        findViewById<Button>(R.id.recoveryPlanDoneButton).setOnClickListener {
            finish()
        }
    }

    private fun openExternal(url: String?) {
        if (url.isNullOrBlank()) {
            Toast.makeText(this, "Link unavailable", Toast.LENGTH_SHORT).show()
            return
        }
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        runCatching { startActivity(intent) }.onFailure {
            Toast.makeText(this, "Unable to open link", Toast.LENGTH_SHORT).show()
        }
    }

    private fun openEftar(suds: Int) {
        val base = BuildConfig.RECOVERY_WEB_BASE_URL.trim().removeSuffix("/")
        if (base.isBlank()) {
            Toast.makeText(this, "EFTAR route unavailable", Toast.LENGTH_SHORT).show()
            return
        }
        val url = Uri.parse(base)
            .buildUpon()
            .path("/eftar")
            .appendQueryParameter("script", "standard_relief")
            .appendQueryParameter("suds", suds.toString())
            .build()
            .toString()
        try {
            RecoveryWebViewActivity.open(this, url)
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, "Unable to open EFTAR", Toast.LENGTH_SHORT).show()
        }
    }

    companion object {
        private const val EXTRA_CORE_EMOTION = "core_emotion"
        private const val EXTRA_SITUATION_CONTEXT = "situation_context"
        private const val EXTRA_AUTOMATIC_THOUGHT = "automatic_thought"
        private const val EXTRA_INTENSITY_BEFORE = "intensity_before"

        fun open(
            context: Context,
            payload: EftStrictIntakeBottomSheet.StrictIntakePayload,
        ) {
            val intent = Intent(context, RecoveryPlanActivity::class.java)
                .putExtra(EXTRA_CORE_EMOTION, payload.coreEmotion)
                .putExtra(EXTRA_SITUATION_CONTEXT, payload.situationContext)
                .putExtra(EXTRA_AUTOMATIC_THOUGHT, payload.automaticThought)
                .putExtra(EXTRA_INTENSITY_BEFORE, payload.intensityBefore)
            context.startActivity(intent)
        }
    }
}
