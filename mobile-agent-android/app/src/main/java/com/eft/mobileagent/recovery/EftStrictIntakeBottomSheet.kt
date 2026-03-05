package com.eft.mobileagent.recovery

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.SeekBar
import android.widget.TextView
import com.eft.mobileagent.R
import com.google.android.material.bottomsheet.BottomSheetDialogFragment

/**
 * Native /eft-strict 7-step intake wizard.
 * Saves only the intake payload (no web open).
 */
class EftStrictIntakeBottomSheet : BottomSheetDialogFragment() {

    interface Listener {
        fun onStrictIntakeSubmit(payload: StrictIntakePayload)
        fun onStrictIntakeCancelled()
    }

    data class StrictIntakePayload(
        val sessionId: String,
        val sessionType: String, // "eftar"
        val userId: String?, // optional (backend can resolve via cookie)
        val coreEmotion: String,
        val situationContext: String,
        val automaticThought: String,
        val physicalSensation: String?,
        val copingAttempt: String?,
        val immediateGoal: String?,
        val intensityBefore: Int,
        // context (optional)
        val entryPoint: String?,
        val scheduleName: String?,
        val focusSessionId: String?,
        val distractionType: String?,
        val blockedMin: Int?,
        val entrySentence: String?,
    )

    private var listener: Listener? = null

    private lateinit var title: TextView
    private lateinit var subtitle: TextView
    private lateinit var progress: ProgressBar
    private lateinit var question: TextView
    private lateinit var input: EditText
    private lateinit var intensityRow: View
    private lateinit var intensitySeek: SeekBar
    private lateinit var intensityValue: TextView
    private lateinit var backBtn: Button
    private lateinit var nextBtn: Button
    private lateinit var cancelBtn: Button

    private var stepIndex = 0

    // Steps (7)
    private val steps = listOf(
        Step("핵심 감정", "지금 핵심 감정은 무엇인가요? (예: 열받음, 답답함, 불안)", Field.CORE_EMOTION),
        Step("상황", "무슨 상황이었나요? (짧게)", Field.SITUATION_CONTEXT),
        Step("자동사고", "떠오른 생각/해석은 무엇이었나요?", Field.AUTOMATIC_THOUGHT),
        Step("신체감각", "몸에서 느껴진 감각이 있나요? (선택)", Field.PHYSICAL_SENSATION, optional = true),
        Step("대처시도", "어떻게 대처했나요? (예: 유튜브, 회피, 딴짓) (선택)", Field.COPING_ATTEMPT, optional = true),
        Step("즉시 목표", "지금 당장 원하는 건 뭐예요? (예: 3분만 시작) (선택)", Field.IMMEDIATE_GOAL, optional = true),
        Step("강도", "감정 강도는 몇 점인가요? (0~10)", Field.INTENSITY_BEFORE),
    )

    private val values: MutableMap<Field, String> = mutableMapOf()
    private var intensity: Int = 6

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.bottom_sheet_eft_strict_intake, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        title = view.findViewById(R.id.strictTitle)
        subtitle = view.findViewById(R.id.strictSubtitle)
        progress = view.findViewById(R.id.strictProgress)
        question = view.findViewById(R.id.strictQuestion)
        input = view.findViewById(R.id.strictInput)
        intensityRow = view.findViewById(R.id.intensityRow)
        intensitySeek = view.findViewById(R.id.intensitySeek)
        intensityValue = view.findViewById(R.id.intensityValue)
        backBtn = view.findViewById(R.id.backBtn)
        nextBtn = view.findViewById(R.id.nextBtn)
        cancelBtn = view.findViewById(R.id.cancelBtn)

        progress.max = steps.size

        intensitySeek.max = 10
        intensitySeek.progress = intensity
        intensityValue.text = intensity.toString()
        intensitySeek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                intensity = progress
                intensityValue.text = progress.toString()
                updateButtons()
            }

            override fun onStartTrackingTouch(seekBar: SeekBar?) {}

            override fun onStopTrackingTouch(seekBar: SeekBar?) {}
        })

        backBtn.setOnClickListener {
            if (stepIndex > 0) {
                stepIndex--
                renderStep()
            }
        }

        nextBtn.setOnClickListener {
            if (!canProceedCurrentStep()) return@setOnClickListener
            persistCurrentStepValue()

            if (stepIndex == steps.lastIndex) {
                submit()
            } else {
                stepIndex++
                renderStep()
            }
        }

        cancelBtn.setOnClickListener {
            listener?.onStrictIntakeCancelled()
            dismissAllowingStateLoss()
        }

        input.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}

            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                updateButtons()
            }

            override fun afterTextChanged(s: Editable?) {}
        })

        // Wire listener from parent fragment/activity
        listener = when {
            parentFragment is Listener -> parentFragment as Listener
            activity is Listener -> activity as Listener
            else -> null
        }

        renderStep()
    }

    private fun renderStep() {
        val step = steps[stepIndex]
        title.text = getString(R.string.strict_intake_title)
        subtitle.text = getString(R.string.strict_intake_step, stepIndex + 1, steps.size)
        progress.progress = stepIndex + 1
        question.text = step.question

        backBtn.visibility = if (stepIndex == 0) View.INVISIBLE else View.VISIBLE

        if (step.field == Field.INTENSITY_BEFORE) {
            input.visibility = View.GONE
            intensityRow.visibility = View.VISIBLE
        } else {
            intensityRow.visibility = View.GONE
            input.visibility = View.VISIBLE
            input.hint = if (step.optional) getString(R.string.strict_intake_optional_hint) else ""
            input.setText(values[step.field].orEmpty())
        }

        nextBtn.text = if (stepIndex == steps.lastIndex) getString(R.string.strict_intake_submit) else getString(R.string.strict_intake_next)
        updateButtons()
    }

    private fun updateButtons() {
        nextBtn.isEnabled = canProceedCurrentStep()
    }

    private fun canProceedCurrentStep(): Boolean {
        val step = steps[stepIndex]
        return if (step.field == Field.INTENSITY_BEFORE) {
            true
        } else {
            val text = input.text?.toString()?.trim().orEmpty()
            step.optional || text.isNotBlank()
        }
    }

    private fun persistCurrentStepValue() {
        val step = steps[stepIndex]
        if (step.field == Field.INTENSITY_BEFORE) return
        values[step.field] = input.text?.toString()?.trim().orEmpty()
    }

    private fun submit() {
        // Required fields
        val coreEmotion = values[Field.CORE_EMOTION].orEmpty().trim()
        val situation = values[Field.SITUATION_CONTEXT].orEmpty().trim()
        val thought = values[Field.AUTOMATIC_THOUGHT].orEmpty().trim()

        if (coreEmotion.isBlank() || situation.isBlank() || thought.isBlank()) {
            // Should not happen due to button gating, but keep safe.
            return
        }

        val sessionId = requireArguments().getString(ARG_SESSION_ID) ?: "android_recovery_${System.currentTimeMillis()}"
        val userId = requireArguments().getString(ARG_USER_ID)?.ifBlank { null }

        val payload = StrictIntakePayload(
            sessionId = sessionId,
            sessionType = "eftar",
            userId = userId,
            coreEmotion = coreEmotion,
            situationContext = situation,
            automaticThought = thought,
            physicalSensation = values[Field.PHYSICAL_SENSATION]?.trim().takeIf { !it.isNullOrBlank() },
            copingAttempt = values[Field.COPING_ATTEMPT]?.trim().takeIf { !it.isNullOrBlank() },
            immediateGoal = values[Field.IMMEDIATE_GOAL]?.trim().takeIf { !it.isNullOrBlank() },
            intensityBefore = intensity,
            entryPoint = requireArguments().getString(ARG_ENTRY_POINT),
            scheduleName = requireArguments().getString(ARG_SCHEDULE_NAME),
            focusSessionId = requireArguments().getString(ARG_FOCUS_SESSION_ID),
            distractionType = requireArguments().getString(ARG_DISTRACTION_TYPE),
            blockedMin = requireArguments().getInt(ARG_BLOCKED_MIN, -1).let { if (it >= 0) it else null },
            entrySentence = requireArguments().getString(ARG_ENTRY_SENTENCE),
        )

        listener?.onStrictIntakeSubmit(payload)
        dismissAllowingStateLoss()
    }

    data class Step(val title: String, val question: String, val field: Field, val optional: Boolean = false)

    enum class Field {
        CORE_EMOTION,
        SITUATION_CONTEXT,
        AUTOMATIC_THOUGHT,
        PHYSICAL_SENSATION,
        COPING_ATTEMPT,
        IMMEDIATE_GOAL,
        INTENSITY_BEFORE,
    }

    companion object {
        private const val ARG_SESSION_ID = "session_id"
        private const val ARG_USER_ID = "user_id"
        private const val ARG_ENTRY_POINT = "entry_point"
        private const val ARG_SCHEDULE_NAME = "schedule_name"
        private const val ARG_FOCUS_SESSION_ID = "focus_session_id"
        private const val ARG_DISTRACTION_TYPE = "distraction_type"
        private const val ARG_BLOCKED_MIN = "blocked_min"
        private const val ARG_ENTRY_SENTENCE = "entry_sentence"

        fun newInstance(
            sessionId: String,
            userId: String?,
            entryPoint: String?,
            scheduleName: String?,
            focusSessionId: String?,
            distractionType: String?,
            blockedMin: Int?,
            entrySentence: String?,
        ): EftStrictIntakeBottomSheet {
            return EftStrictIntakeBottomSheet().apply {
                arguments = Bundle().apply {
                    putString(ARG_SESSION_ID, sessionId)
                    putString(ARG_USER_ID, userId)
                    putString(ARG_ENTRY_POINT, entryPoint)
                    putString(ARG_SCHEDULE_NAME, scheduleName)
                    putString(ARG_FOCUS_SESSION_ID, focusSessionId)
                    putString(ARG_DISTRACTION_TYPE, distractionType)
                    if (blockedMin != null) putInt(ARG_BLOCKED_MIN, blockedMin)
                    putString(ARG_ENTRY_SENTENCE, entrySentence)
                }
            }
        }
    }
}
