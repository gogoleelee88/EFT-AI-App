package com.eft.mobileagent.recovery

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.TextView
import androidx.core.view.isVisible
import com.eft.mobileagent.R
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import kotlin.math.max

/**
 * Chat-like 7-step /eft-strict intake:
 * - One question at a time (assistant bubble)
 * - User answers (user bubble)
 * - Intensity uses SeekBar as a special step
 *
 * On submit, calls Listener with the same payload shape as the form version.
 */
class EftStrictIntakeChatBottomSheet : BottomSheetDialogFragment() {

    interface Listener {
        fun onStrictIntakeSubmit(payload: EftStrictIntakeBottomSheet.StrictIntakePayload)
        fun onStrictIntakeCancelled()
    }

    private var listener: Listener? = null

    private lateinit var scroll: ScrollView
    private lateinit var messages: LinearLayout
    private lateinit var inputRow: View
    private lateinit var input: EditText
    private lateinit var sendBtn: Button
    private lateinit var cancelBtn: Button
    private lateinit var intensityRow: View
    private lateinit var intensitySeek: SeekBar
    private lateinit var intensityValue: TextView
    private lateinit var intensitySendBtn: Button

    private var stepIndex = 0
    private var intensity: Int = 6
    private val ui = Handler(Looper.getMainLooper())

    private val values: MutableMap<Field, String> = mutableMapOf()

    private val steps = listOf(
        Step("핵심 감정", "지금 핵심 감정은 무엇인가요? (예: 열받음, 답답함, 불안)", Field.CORE_EMOTION, optional = false),
        Step("상황", "무슨 상황이었나요? (짧게)", Field.SITUATION_CONTEXT, optional = false),
        Step("자동사고", "떠오른 생각/해석은 무엇이었나요?", Field.AUTOMATIC_THOUGHT, optional = false),
        Step("신체감각", "몸에서 느껴진 감각이 있나요? (선택)", Field.PHYSICAL_SENSATION, optional = true),
        Step("대처시도", "어떻게 대처했나요? (예: 유튜브/회피/딴짓) (선택)", Field.COPING_ATTEMPT, optional = true),
        Step("즉시 목표", "지금 당장 원하는 건 뭐예요? (예: 3분만 시작) (선택)", Field.IMMEDIATE_GOAL, optional = true),
        Step("강도", "감정 강도는 몇 점인가요? (0~10)", Field.INTENSITY_BEFORE, optional = false),
    )

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.bottom_sheet_eft_strict_intake_chat, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        scroll = view.findViewById(R.id.chatScroll)
        messages = view.findViewById(R.id.chatMessages)
        inputRow = view.findViewById(R.id.inputRow)
        input = view.findViewById(R.id.chatInput)
        sendBtn = view.findViewById(R.id.sendBtn)
        cancelBtn = view.findViewById(R.id.cancelBtn)
        intensityRow = view.findViewById(R.id.intensityRow)
        intensitySeek = view.findViewById(R.id.intensitySeek)
        intensityValue = view.findViewById(R.id.intensityValue)
        intensitySendBtn = view.findViewById(R.id.intensitySendBtn)

        listener = when {
            parentFragment is Listener -> parentFragment as Listener
            activity is Listener -> activity as Listener
            else -> null
        }

        intensitySeek.max = 10
        intensitySeek.progress = intensity
        intensityValue.text = intensity.toString()
        intensitySeek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                intensity = progress
                intensityValue.text = progress.toString()
            }

            override fun onStartTrackingTouch(seekBar: SeekBar?) {}

            override fun onStopTrackingTouch(seekBar: SeekBar?) {}
        })

        cancelBtn.setOnClickListener {
            listener?.onStrictIntakeCancelled()
            dismissAllowingStateLoss()
        }

        sendBtn.setOnClickListener { handleTextAnswer() }
        intensitySendBtn.setOnClickListener { handleIntensityAnswer() }

        // Start conversation
        addAssistantMessageWithTyping(getString(R.string.strict_chat_intro))
        ui.postDelayed({ askCurrentStep() }, 350L)
    }

    private fun askCurrentStep() {
        val step = steps[stepIndex]
        addAssistantMessageWithTyping(step.question)

        val isIntensity = step.field == Field.INTENSITY_BEFORE
        inputRow.isVisible = !isIntensity
        intensityRow.isVisible = isIntensity

        if (!isIntensity) {
            input.setText("")
            input.hint = if (step.optional) getString(R.string.strict_chat_optional_hint) else getString(R.string.strict_chat_required_hint)
            input.requestFocus()
        }

        scrollToBottom()
    }

    private fun handleTextAnswer() {
        val step = steps[stepIndex]
        val text = input.text?.toString()?.trim().orEmpty()

        if (!step.optional && text.isBlank()) {
            input.error = getString(R.string.strict_chat_required_error)
            return
        }

        // Save & show user bubble (for optional empty, show "(skip)")
        val shown = if (text.isBlank()) getString(R.string.strict_chat_skip) else text
        addUserMessage(shown)

        values[step.field] = text
        advance()
    }

    private fun handleIntensityAnswer() {
        addUserMessage(intensity.toString())
        advance()
    }

    private fun advance() {
        if (stepIndex == steps.lastIndex) {
            submit()
            return
        }
        stepIndex++
        askCurrentStep()
    }

    private fun submit() {
        val coreEmotion = values[Field.CORE_EMOTION].orEmpty().trim()
        val situation = values[Field.SITUATION_CONTEXT].orEmpty().trim()
        val thought = values[Field.AUTOMATIC_THOUGHT].orEmpty().trim()

        if (coreEmotion.isBlank() || situation.isBlank() || thought.isBlank()) {
            addAssistantMessageWithTyping(getString(R.string.strict_chat_incomplete_error))
            scrollToBottom()
            return
        }

        val sessionId = requireArguments().getString(ARG_SESSION_ID)
            ?: "android_recovery_${System.currentTimeMillis()}"

        val payload = EftStrictIntakeBottomSheet.StrictIntakePayload(
            sessionId = sessionId,
            sessionType = "eftar",
            userId = requireArguments().getString(ARG_USER_ID)?.ifBlank { null },
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

    private fun addAssistantMessageWithTyping(text: String) {
        val typingView = layoutInflater.inflate(R.layout.item_chat_typing, messages, false)
        messages.addView(typingView)
        startTypingDotsAnimation(typingView)
        scrollToBottom()

        val delay = (350L + max(0, text.length - 12) * 18L).coerceAtMost(1200L)
        ui.postDelayed({
            val idx = messages.indexOfChild(typingView)
            if (idx >= 0) messages.removeViewAt(idx)

            val bubble = layoutInflater.inflate(R.layout.item_chat_bubble_assistant, messages, false)
            val tv = bubble.findViewById<TextView>(R.id.assistantText)
            tv.text = text
            messages.addView(bubble)
            scrollToBottom()
        }, delay)
    }

    private fun startTypingDotsAnimation(typingView: View) {
        val d1 = typingView.findViewById<TextView>(R.id.dot1)
        val d2 = typingView.findViewById<TextView>(R.id.dot2)
        val d3 = typingView.findViewById<TextView>(R.id.dot3)

        fun pulse(v: TextView, baseDelay: Long) {
            val runnable = object : Runnable {
                var phase = 0

                override fun run() {
                    if (!typingView.isAttachedToWindow) return
                    v.alpha = when (phase % 3) {
                        0 -> 0.35f
                        1 -> 1.0f
                        else -> 0.6f
                    }
                    phase++
                    ui.postDelayed(this, 220L)
                }
            }
            ui.postDelayed(runnable, baseDelay)
        }

        pulse(d1, 0L)
        pulse(d2, 80L)
        pulse(d3, 160L)
    }

    private fun addUserMessage(text: String) {
        val bubble = layoutInflater.inflate(R.layout.item_chat_bubble_user, messages, false)
        val tv = bubble.findViewById<TextView>(R.id.userText)
        tv.text = text
        messages.addView(bubble)
        scrollToBottom()
    }

    override fun onDestroyView() {
        ui.removeCallbacksAndMessages(null)
        super.onDestroyView()
    }

    private fun scrollToBottom() {
        scroll.post { scroll.fullScroll(View.FOCUS_DOWN) }
    }

    data class Step(val title: String, val question: String, val field: Field, val optional: Boolean)

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
        ): EftStrictIntakeChatBottomSheet {
            return EftStrictIntakeChatBottomSheet().apply {
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
