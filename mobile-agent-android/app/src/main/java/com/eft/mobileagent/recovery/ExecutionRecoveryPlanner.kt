package com.eft.mobileagent.recovery

import java.util.Locale

data class RecoveryCard(
    val title: String,
    val subtitle: String,
    val durationLabel: String,
    val actionLabel: String,
    val href: String? = null,
)

data class RecoveryMicroAction(
    val instruction: String,
    val fallbackInstruction: String,
    val nextInstruction: String,
    val doneWhen: String,
)

data class ExecutionRecoveryPlan(
    val emotionLabel: String,
    val frictionLabel: String,
    val resetMessage: String,
    val resetDetail: String,
    val eftRecommendation: RecoveryCard,
    val eftTappingPoints: List<String>,
    val meditationRecommendation: RecoveryCard,
    val battleModeRecommendation: RecoveryCard,
    val battleModeTrackLabel: String,
    val microAction: RecoveryMicroAction,
)

object ExecutionRecoveryPlanner {
    fun build(
        emotionInput: String,
        situationInput: String,
    ): ExecutionRecoveryPlan {
        val emotion = normalizeEmotion(emotionInput, situationInput)
        val context = detectContext(situationInput)
        val microAction = buildMicroAction(emotion, context)
        val config = emotionConfig(emotion)
        return ExecutionRecoveryPlan(
            emotionLabel = config.emotionLabel,
            frictionLabel = config.frictionLabel,
            resetMessage = config.resetMessage,
            resetDetail = config.resetDetail,
            eftRecommendation = config.eftRecommendation,
            eftTappingPoints = config.eftTappingPoints,
            meditationRecommendation = config.meditationRecommendation,
            battleModeRecommendation = config.battleModeRecommendation,
            battleModeTrackLabel = config.battleModeTrackLabel,
            microAction = microAction,
        )
    }

    private enum class RecoveryEmotion {
        ANXIOUS,
        BLOCKED,
        TIRED,
        AVOIDANT,
        OVERWHELMED,
        FRUSTRATED,
        DISTRACTED,
    }

    private enum class RecoveryContextKind {
        CODE,
        WRITING,
        DESIGN,
        COMMUNICATION,
        SPREADSHEET,
        STUDY,
        GENERIC,
    }

    private data class RecoveryContext(
        val kind: RecoveryContextKind,
        val targetObject: String,
        val fileName: String? = null,
    )

    private data class EmotionConfig(
        val emotionLabel: String,
        val frictionLabel: String,
        val resetMessage: String,
        val resetDetail: String,
        val eftRecommendation: RecoveryCard,
        val eftTappingPoints: List<String>,
        val meditationRecommendation: RecoveryCard,
        val battleModeRecommendation: RecoveryCard,
        val battleModeTrackLabel: String,
    )

    private val filePattern =
        Regex("""\b([A-Za-z0-9_./-]+\.(?:tsx|ts|jsx|js|kt|java|py|swift|json|md|html|css|sql|yaml|yml|xml))\b""")

    private val bannedPrefixes = setOf("think", "analyze", "plan", "reflect", "brainstorm", "figure")

    private fun toYouTubeSearch(query: String): String =
        "https://www.youtube.com/results?search_query=${java.net.URLEncoder.encode(query, Charsets.UTF_8.name())}"

    private fun titleCase(value: String): String {
        if (value.isEmpty()) return value
        return value.substring(0, 1).uppercase(Locale.US) + value.substring(1)
    }

    private fun formatInstruction(raw: String): String {
        val trimmed = raw.trim().replace(Regex("\\s+"), " ")
        if (trimmed.isBlank()) return "Open the task note."
        val normalized = if (trimmed.endsWith(".")) trimmed else "$trimmed."
        val firstWord = normalized.split(Regex("\\s+")).firstOrNull()?.lowercase(Locale.US).orEmpty()
        if (firstWord in bannedPrefixes) return "Open the task note."
        return titleCase(normalized)
    }

    private fun normalizeEmotion(
        emotion: String,
        situation: String,
    ): RecoveryEmotion {
        val combined = "$emotion $situation".lowercase(Locale.US)
        return when {
            Regex("(anx|anxiety|nervous|worried|stress|fear|panic)").containsMatchIn(combined) -> RecoveryEmotion.ANXIOUS
            Regex("(overwhelm|too much|chaos|flooded|swamped)").containsMatchIn(combined) -> RecoveryEmotion.OVERWHELMED
            Regex("(avoid|procrastin|dodg|dread|resist)").containsMatchIn(combined) -> RecoveryEmotion.AVOIDANT
            Regex("(tired|fatigue|exhaust|sleepy|drained|fog)").containsMatchIn(combined) -> RecoveryEmotion.TIRED
            Regex("(distract|youtube|scroll|social|sns|tab hopping|backgrounded)").containsMatchIn(combined) -> RecoveryEmotion.DISTRACTED
            Regex("(frustrat|angry|annoyed|mad)").containsMatchIn(combined) -> RecoveryEmotion.FRUSTRATED
            else -> RecoveryEmotion.BLOCKED
        }
    }

    private fun detectContext(situation: String): RecoveryContext {
        val normalized = situation.trim()
        val lower = normalized.lowercase(Locale.US)
        val fileMatch = filePattern.find(normalized)?.groupValues?.getOrNull(1)
        if (!fileMatch.isNullOrBlank()) {
            return RecoveryContext(
                kind = RecoveryContextKind.CODE,
                targetObject = fileMatch,
                fileName = fileMatch,
            )
        }
        return when {
            Regex("(error|exception|stack trace|failing test|bug|compile)").containsMatchIn(lower) ->
                RecoveryContext(RecoveryContextKind.CODE, "the first error line")
            Regex("(google login|oauth|auth|login|api|endpoint|coding|code|implement)").containsMatchIn(lower) ->
                RecoveryContext(RecoveryContextKind.CODE, "the project folder")
            Regex("(figma|frame|component|prototype|design|ui|ux)").containsMatchIn(lower) ->
                RecoveryContext(RecoveryContextKind.DESIGN, "the Figma file")
            Regex("(email|reply|message|slack|dm|inbox)").containsMatchIn(lower) ->
                RecoveryContext(RecoveryContextKind.COMMUNICATION, "the reply box")
            Regex("(sheet|spreadsheet|cell|excel|table)").containsMatchIn(lower) ->
                RecoveryContext(RecoveryContextKind.SPREADSHEET, "the spreadsheet")
            Regex("(essay|draft|doc|document|write|writing|copy|blog)").containsMatchIn(lower) ->
                RecoveryContext(RecoveryContextKind.WRITING, "the draft")
            Regex("(assignment|exam|study|article|pdf|research)").containsMatchIn(lower) ->
                RecoveryContext(RecoveryContextKind.STUDY, "the assignment page")
            else -> RecoveryContext(RecoveryContextKind.GENERIC, "the task note")
        }
    }

    private fun buildMicroAction(
        emotion: RecoveryEmotion,
        context: RecoveryContext,
    ): RecoveryMicroAction {
        val openTarget = context.fileName ?: context.targetObject
        return when (emotion) {
            RecoveryEmotion.ANXIOUS ->
                if (context.targetObject == "the first error line") {
                    RecoveryMicroAction(
                        instruction = formatInstruction("Read the first error line"),
                        fallbackInstruction = formatInstruction("Open the terminal"),
                        nextInstruction = formatInstruction("Open the failing file"),
                        doneWhen = "Done when that single line is visible on screen.",
                    )
                } else {
                    RecoveryMicroAction(
                        instruction = formatInstruction("Open $openTarget"),
                        fallbackInstruction = formatInstruction("Open the project folder"),
                        nextInstruction = formatInstruction("Read the first visible line"),
                        doneWhen = "Done when it is open on screen.",
                    )
                }

            RecoveryEmotion.TIRED ->
                RecoveryMicroAction(
                    instruction = formatInstruction(
                        if (context.kind == RecoveryContextKind.COMMUNICATION) "Open ${context.targetObject}" else "Reopen the last work tab",
                    ),
                    fallbackInstruction = formatInstruction("Open the task note"),
                    nextInstruction = formatInstruction("Open $openTarget"),
                    doneWhen = "Done when your work surface is back in front of you.",
                )

            RecoveryEmotion.AVOIDANT ->
                when (context.kind) {
                    RecoveryContextKind.CODE -> RecoveryMicroAction(
                        instruction = formatInstruction("Write one TODO comment"),
                        fallbackInstruction = formatInstruction("Open $openTarget"),
                        nextInstruction = formatInstruction("Read the next line"),
                        doneWhen = "Done when the new comment is visible on screen.",
                    )

                    RecoveryContextKind.WRITING -> RecoveryMicroAction(
                        instruction = formatInstruction("Write one ugly first sentence"),
                        fallbackInstruction = formatInstruction("Open $openTarget"),
                        nextInstruction = formatInstruction("Write one bullet"),
                        doneWhen = "Done when the new sentence is visible on screen.",
                    )

                    RecoveryContextKind.COMMUNICATION -> RecoveryMicroAction(
                        instruction = formatInstruction("Type Thanks, I am on it"),
                        fallbackInstruction = formatInstruction("Open ${context.targetObject}"),
                        nextInstruction = formatInstruction("Type one more line"),
                        doneWhen = "Done when the draft reply is visible on screen.",
                    )

                    else -> RecoveryMicroAction(
                        instruction = formatInstruction("Open $openTarget"),
                        fallbackInstruction = formatInstruction("Open the task note"),
                        nextInstruction = formatInstruction("Type one line"),
                        doneWhen = "Done when it is visible on screen.",
                    )
                }

            RecoveryEmotion.OVERWHELMED ->
                if (context.kind == RecoveryContextKind.CODE) {
                    RecoveryMicroAction(
                        instruction = formatInstruction(
                            if (context.targetObject == "the first error line") "Read the first error line" else "Open $openTarget",
                        ),
                        fallbackInstruction = formatInstruction("Open the project folder"),
                        nextInstruction = formatInstruction("Read one line"),
                        doneWhen = "Done when one single work object is in front of you.",
                    )
                } else {
                    RecoveryMicroAction(
                        instruction = formatInstruction("Open $openTarget"),
                        fallbackInstruction = formatInstruction("Open the task note"),
                        nextInstruction = formatInstruction("Highlight one unfinished line"),
                        doneWhen = "Done when only one object is on screen.",
                    )
                }

            RecoveryEmotion.FRUSTRATED ->
                if (context.kind == RecoveryContextKind.CODE) {
                    RecoveryMicroAction(
                        instruction = formatInstruction("Run the failing test once"),
                        fallbackInstruction = formatInstruction("Read the first error line"),
                        nextInstruction = formatInstruction("Open the failing file"),
                        doneWhen = "Done when the run starts.",
                    )
                } else {
                    RecoveryMicroAction(
                        instruction = formatInstruction("Read ${context.targetObject}"),
                        fallbackInstruction = formatInstruction("Open $openTarget"),
                        nextInstruction = formatInstruction("Type one note"),
                        doneWhen = "Done when you have one visible clue on screen.",
                    )
                }

            RecoveryEmotion.DISTRACTED ->
                RecoveryMicroAction(
                    instruction = formatInstruction("Reopen the last work tab"),
                    fallbackInstruction = formatInstruction("Open $openTarget"),
                    nextInstruction = formatInstruction("Read the first visible line"),
                    doneWhen = "Done when the work tab is back in front of you.",
                )

            RecoveryEmotion.BLOCKED ->
                when (context.kind) {
                    RecoveryContextKind.COMMUNICATION -> RecoveryMicroAction(
                        instruction = formatInstruction("Open ${context.targetObject}"),
                        fallbackInstruction = formatInstruction("Open the inbox"),
                        nextInstruction = formatInstruction("Type one line"),
                        doneWhen = "Done when the reply box is visible on screen.",
                    )

                    RecoveryContextKind.STUDY -> RecoveryMicroAction(
                        instruction = formatInstruction("Read ${context.targetObject}"),
                        fallbackInstruction = formatInstruction("Open the PDF"),
                        nextInstruction = formatInstruction("Highlight one sentence"),
                        doneWhen = "Done when the first question is visible on screen.",
                    )

                    else -> RecoveryMicroAction(
                        instruction = formatInstruction(
                            if (context.targetObject == "the first error line") "Read the first error line" else "Open $openTarget",
                        ),
                        fallbackInstruction = formatInstruction("Open the task note"),
                        nextInstruction = formatInstruction("Read the first visible line"),
                        doneWhen = "Done when one concrete object is visible on screen.",
                    )
                }
        }
    }

    private fun emotionConfig(emotion: RecoveryEmotion): EmotionConfig {
        return when (emotion) {
            RecoveryEmotion.ANXIOUS -> EmotionConfig(
                emotionLabel = "Anxious",
                frictionLabel = "fear spike",
                resetMessage = "You do not need to solve the whole task. Restart contact with it.",
                resetDetail = "Lower threat first, then make one safe visible move.",
                eftRecommendation = RecoveryCard("45-second calming EFT", "Tap to lower pressure before you push.", "45 sec", "Tap now"),
                eftTappingPoints = listOf("Side of hand", "Collarbone", "Under eye"),
                meditationRecommendation = RecoveryCard(
                    "60-second grounding reset",
                    "If tapping feels too activating, take a quieter reset.",
                    "60 sec",
                    "Open video",
                    toYouTubeSearch("60 second grounding meditation anxiety"),
                ),
                battleModeRecommendation = RecoveryCard(
                    "Steady battle mode",
                    "Low-variance focus pulse to stop rumination loops.",
                    "2 min",
                    "Open track",
                    toYouTubeSearch("instrumental focus music no lyrics steady cinematic"),
                ),
                battleModeTrackLabel = "Steady cinematic pulse",
            )

            RecoveryEmotion.BLOCKED -> EmotionConfig(
                emotionLabel = "Blocked",
                frictionLabel = "no clear entry point",
                resetMessage = "You do not need clarity first. Find one concrete point of contact.",
                resetDetail = "The goal is not solving the task. The goal is touching one real object.",
                eftRecommendation = RecoveryCard("30-second unblock EFT", "Tap while repeating: one concrete move is enough.", "30 sec", "Tap now"),
                eftTappingPoints = listOf("Side of hand", "Temple", "Collarbone"),
                meditationRecommendation = RecoveryCard(
                    "Clarity reset",
                    "Short guided breathing to narrow your attention.",
                    "60 sec",
                    "Open video",
                    toYouTubeSearch("1 minute focus reset meditation clarity"),
                ),
                battleModeRecommendation = RecoveryCard(
                    "Forward motion track",
                    "A simple pulse for re-entry, not intensity.",
                    "2 min",
                    "Open track",
                    toYouTubeSearch("focus music instrumental no lyrics work sprint"),
                ),
                battleModeTrackLabel = "Forward motion pulse",
            )

            RecoveryEmotion.TIRED -> EmotionConfig(
                emotionLabel = "Tired",
                frictionLabel = "low energy",
                resetMessage = "Low energy is okay. Choose the easiest possible re-entry.",
                resetDetail = "No hard thinking. Reopen one work surface and let momentum do the rest.",
                eftRecommendation = RecoveryCard("30-second wake-up EFT", "Tap lightly and keep your shoulders loose.", "30 sec", "Tap now"),
                eftTappingPoints = listOf("Side of hand", "Collarbone", "Under arm"),
                meditationRecommendation = RecoveryCard(
                    "One-minute reactivation",
                    "Short breath cue for foggy attention.",
                    "60 sec",
                    "Open video",
                    toYouTubeSearch("1 minute energizing breathing reset work"),
                ),
                battleModeRecommendation = RecoveryCard(
                    "Light percussion battle mode",
                    "Bright pulse to help low-energy re-entry.",
                    "2 min",
                    "Open track",
                    toYouTubeSearch("upbeat instrumental focus music no lyrics"),
                ),
                battleModeTrackLabel = "Bright work pulse",
            )

            RecoveryEmotion.AVOIDANT -> EmotionConfig(
                emotionLabel = "Avoidant",
                frictionLabel = "task dread",
                resetMessage = "You are not committing to the whole task. Just touch it once.",
                resetDetail = "Tiny contact beats perfect readiness. One small move is enough.",
                eftRecommendation = RecoveryCard("45-second self-acceptance EFT", "Use tapping to lower shame and resistance.", "45 sec", "Tap now"),
                eftTappingPoints = listOf("Side of hand", "Collarbone", "Top of head"),
                meditationRecommendation = RecoveryCard(
                    "Gentle restart video",
                    "Use this if your body wants a softer ramp back in.",
                    "60 sec",
                    "Open video",
                    toYouTubeSearch("1 minute gentle reset for procrastination"),
                ),
                battleModeRecommendation = RecoveryCard(
                    "Commitment battle mode",
                    "A clean pulse that makes starting feel easier.",
                    "2 min",
                    "Open track",
                    toYouTubeSearch("battle mode focus music instrumental no lyrics"),
                ),
                battleModeTrackLabel = "Commitment pulse",
            )

            RecoveryEmotion.OVERWHELMED -> EmotionConfig(
                emotionLabel = "Overwhelmed",
                frictionLabel = "too many moving parts",
                resetMessage = "Shrink the task until there is only one object left.",
                resetDetail = "Narrow your attention to a single visible target.",
                eftRecommendation = RecoveryCard("45-second grounding EFT", "Tap and repeat: one object only.", "45 sec", "Tap now"),
                eftTappingPoints = listOf("Side of hand", "Collarbone", "Under eye"),
                meditationRecommendation = RecoveryCard(
                    "Narrowing breath reset",
                    "Short guided breathing to calm overload.",
                    "60 sec",
                    "Open video",
                    toYouTubeSearch("1 minute grounding breath for overwhelm"),
                ),
                battleModeRecommendation = RecoveryCard(
                    "Sparse battle mode",
                    "Low-clutter rhythm for overloaded attention.",
                    "2 min",
                    "Open track",
                    toYouTubeSearch("minimal instrumental focus music no lyrics"),
                ),
                battleModeTrackLabel = "Sparse pulse",
            )

            RecoveryEmotion.FRUSTRATED -> EmotionConfig(
                emotionLabel = "Frustrated",
                frictionLabel = "agitated resistance",
                resetMessage = "Do not force progress. Capture one visible clue.",
                resetDetail = "Channel the energy into one concrete move instead of fighting the whole task.",
                eftRecommendation = RecoveryCard("30-second release EFT", "Tap to reduce heat before you act.", "30 sec", "Tap now"),
                eftTappingPoints = listOf("Side of hand", "Under eye", "Collarbone"),
                meditationRecommendation = RecoveryCard(
                    "Quick decompression",
                    "Use this if the pressure feels too hot to work with.",
                    "60 sec",
                    "Open video",
                    toYouTubeSearch("1 minute stress relief breathing for work"),
                ),
                battleModeRecommendation = RecoveryCard(
                    "Controlled intensity track",
                    "Heavy enough to channel energy, steady enough to stay useful.",
                    "2 min",
                    "Open track",
                    toYouTubeSearch("intense instrumental focus music no vocals"),
                ),
                battleModeTrackLabel = "Controlled intensity",
            )

            RecoveryEmotion.DISTRACTED -> EmotionConfig(
                emotionLabel = "Distracted",
                frictionLabel = "attention drift",
                resetMessage = "Return to one work surface. Nothing else matters for 2 minutes.",
                resetDetail = "Do not fix your whole focus. Recover one clean work tab.",
                eftRecommendation = RecoveryCard("20-second refocus EFT", "A quick tap sequence before re-entry.", "20 sec", "Tap now"),
                eftTappingPoints = listOf("Side of hand", "Temple", "Collarbone"),
                meditationRecommendation = RecoveryCard(
                    "Refocus video",
                    "Short guided reset if you need an attention reset first.",
                    "45 sec",
                    "Open video",
                    toYouTubeSearch("45 second focus reset meditation"),
                ),
                battleModeRecommendation = RecoveryCard(
                    "Context switch battle mode",
                    "Punchy pulse for snapping attention back to work.",
                    "2 min",
                    "Open track",
                    toYouTubeSearch("focus music no lyrics productivity sprint"),
                ),
                battleModeTrackLabel = "Context switch cue",
            )
        }
    }
}
