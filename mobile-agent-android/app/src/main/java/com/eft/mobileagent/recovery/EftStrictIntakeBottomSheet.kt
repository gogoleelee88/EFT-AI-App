package com.eft.mobileagent.recovery

class EftStrictIntakeBottomSheet {
    data class StrictIntakePayload(
        val sessionId: String,
        val sessionType: String,
        val userId: String?,
        val coreEmotion: String,
        val situationContext: String,
        val automaticThought: String,
        val physicalSensation: String?,
        val copingAttempt: String?,
        val immediateGoal: String?,
        val intensityBefore: Int,
        val entryPoint: String?,
        val scheduleName: String?,
        val focusSessionId: String?,
        val distractionType: String?,
        val blockedMin: Int?,
        val entrySentence: String?,
    )
}
