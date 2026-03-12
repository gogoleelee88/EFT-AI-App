export type RecoveryEmotion =
  | "anxious"
  | "blocked"
  | "tired"
  | "avoidant"
  | "overwhelmed"
  | "frustrated"
  | "distracted";

type RecoveryContextKind =
  | "code"
  | "writing"
  | "design"
  | "communication"
  | "spreadsheet"
  | "study"
  | "generic";

type RecoveryContext = {
  kind: RecoveryContextKind;
  object: string;
  fileName?: string;
};

export type RecoveryCard = {
  title: string;
  subtitle: string;
  durationLabel: string;
  actionLabel: string;
  href?: string;
};

export type RecoveryMicroAction = {
  instruction: string;
  fallbackInstruction: string;
  nextInstruction: string;
  doneWhen: string;
};

export type ExecutionRecoveryPlan = {
  emotion: RecoveryEmotion;
  emotionLabel: string;
  frictionLabel: string;
  resetMessage: string;
  resetDetail: string;
  eftRecommendation: RecoveryCard & {
    tappingPoints: string[];
  };
  meditationRecommendation: RecoveryCard;
  battleModeRecommendation: RecoveryCard & {
    trackLabel: string;
  };
  microAction: RecoveryMicroAction;
};

const FILE_PATTERN =
  /\b([A-Za-z0-9_./-]+\.(?:tsx|ts|jsx|js|kt|java|py|swift|json|md|html|css|sql|yaml|yml|xml))\b/i;

const BANNED_PREFIXES = ["think", "analyze", "plan", "reflect", "brainstorm", "figure out"];

const toYouTubeSearch = (query: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

const titleCase = (value: string): string =>
  value.length === 0 ? value : `${value.charAt(0).toUpperCase()}${value.slice(1)}`;

const formatInstruction = (raw: string): string => {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Open the task note.";
  const normalized = trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
  const firstWord = normalized.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (BANNED_PREFIXES.includes(firstWord)) {
    return "Open the task note.";
  }
  return titleCase(normalized);
};

const normalizeEmotion = (emotion: string, situation: string): RecoveryEmotion => {
  const combined = `${emotion} ${situation}`.toLowerCase();
  if (/(anx|anxiety|nervous|worried|stress|fear|panic)/.test(combined)) return "anxious";
  if (/(overwhelm|too much|chaos|flooded|swamped)/.test(combined)) return "overwhelmed";
  if (/(avoid|procrastin|dodg|dread|resist)/.test(combined)) return "avoidant";
  if (/(tired|fatigue|exhaust|sleepy|drained|fog)/.test(combined)) return "tired";
  if (/(distract|youtube|scroll|social|sns|tab hopping|backgrounded)/.test(combined)) {
    return "distracted";
  }
  if (/(frustrat|angry|annoyed|mad)/.test(combined)) return "frustrated";
  return "blocked";
};

const detectContext = (situation: string): RecoveryContext => {
  const normalized = situation.trim();
  const lower = normalized.toLowerCase();
  const fileMatch = normalized.match(FILE_PATTERN);
  if (fileMatch?.[1]) {
    return {
      kind: "code",
      object: fileMatch[1],
      fileName: fileMatch[1],
    };
  }
  if (/(error|exception|stack trace|failing test|bug|compile)/.test(lower)) {
    return { kind: "code", object: "the first error line" };
  }
  if (/(google login|oauth|auth|login|api|endpoint|coding|code|implement)/.test(lower)) {
    return { kind: "code", object: "the project folder" };
  }
  if (/(figma|frame|component|prototype|design|ui|ux)/.test(lower)) {
    return { kind: "design", object: "the Figma file" };
  }
  if (/(email|reply|message|slack|dm|inbox)/.test(lower)) {
    return { kind: "communication", object: "the reply box" };
  }
  if (/(sheet|spreadsheet|cell|excel|table)/.test(lower)) {
    return { kind: "spreadsheet", object: "the spreadsheet" };
  }
  if (/(essay|draft|doc|document|write|writing|copy|blog)/.test(lower)) {
    return { kind: "writing", object: "the draft" };
  }
  if (/(assignment|exam|study|article|pdf|research)/.test(lower)) {
    return { kind: "study", object: "the assignment page" };
  }
  return { kind: "generic", object: "the task note" };
};

const buildMicroAction = (
  emotion: RecoveryEmotion,
  context: RecoveryContext,
): RecoveryMicroAction => {
  const openObject = context.fileName ?? context.object;

  switch (emotion) {
    case "anxious":
      if (context.object === "the first error line") {
        return {
          instruction: formatInstruction("Read the first error line"),
          fallbackInstruction: formatInstruction("Open the terminal"),
          nextInstruction: formatInstruction("Open the failing file"),
          doneWhen: "Done when that single line is visible on screen.",
        };
      }
      return {
        instruction: formatInstruction(`Open ${openObject}`),
        fallbackInstruction: formatInstruction("Open the project folder"),
        nextInstruction: formatInstruction("Read the first visible line"),
        doneWhen: "Done when it is open on screen.",
      };
    case "tired":
      return {
        instruction: formatInstruction(
          context.kind === "communication" ? `Open ${context.object}` : "Reopen the last work tab",
        ),
        fallbackInstruction: formatInstruction("Open the task note"),
        nextInstruction: formatInstruction(`Open ${openObject}`),
        doneWhen: "Done when your work surface is back in front of you.",
      };
    case "avoidant":
      if (context.kind === "code") {
        return {
          instruction: formatInstruction("Write one TODO comment"),
          fallbackInstruction: formatInstruction(`Open ${openObject}`),
          nextInstruction: formatInstruction("Read the next line"),
          doneWhen: "Done when the new comment is visible on screen.",
        };
      }
      if (context.kind === "writing") {
        return {
          instruction: formatInstruction("Write one ugly first sentence"),
          fallbackInstruction: formatInstruction(`Open ${openObject}`),
          nextInstruction: formatInstruction("Write one bullet"),
          doneWhen: "Done when the new sentence is visible on screen.",
        };
      }
      if (context.kind === "communication") {
        return {
          instruction: formatInstruction("Type Thanks, I am on it"),
          fallbackInstruction: formatInstruction(`Open ${context.object}`),
          nextInstruction: formatInstruction("Type one more line"),
          doneWhen: "Done when the draft reply is visible on screen.",
        };
      }
      return {
        instruction: formatInstruction(`Open ${openObject}`),
        fallbackInstruction: formatInstruction("Open the task note"),
        nextInstruction: formatInstruction("Type one line"),
        doneWhen: "Done when it is visible on screen.",
      };
    case "overwhelmed":
      if (context.kind === "code") {
        return {
          instruction: formatInstruction(
            context.object === "the first error line" ? "Read the first error line" : `Open ${openObject}`,
          ),
          fallbackInstruction: formatInstruction("Open the project folder"),
          nextInstruction: formatInstruction("Read one line"),
          doneWhen: "Done when one single work object is in front of you.",
        };
      }
      return {
        instruction: formatInstruction(`Open ${openObject}`),
        fallbackInstruction: formatInstruction("Open the task note"),
        nextInstruction: formatInstruction("Highlight one unfinished line"),
        doneWhen: "Done when only one object is on screen.",
      };
    case "frustrated":
      if (context.kind === "code") {
        return {
          instruction: formatInstruction("Run the failing test once"),
          fallbackInstruction: formatInstruction("Read the first error line"),
          nextInstruction: formatInstruction("Open the failing file"),
          doneWhen: "Done when the run starts.",
        };
      }
      return {
        instruction: formatInstruction(`Read ${context.object}`),
        fallbackInstruction: formatInstruction(`Open ${openObject}`),
        nextInstruction: formatInstruction("Type one note"),
        doneWhen: "Done when you have one visible clue on screen.",
      };
    case "distracted":
      return {
        instruction: formatInstruction("Reopen the last work tab"),
        fallbackInstruction: formatInstruction(`Open ${openObject}`),
        nextInstruction: formatInstruction("Read the first visible line"),
        doneWhen: "Done when the work tab is back in front of you.",
      };
    case "blocked":
    default:
      if (context.kind === "communication") {
        return {
          instruction: formatInstruction(`Open ${context.object}`),
          fallbackInstruction: formatInstruction("Open the inbox"),
          nextInstruction: formatInstruction("Type one line"),
          doneWhen: "Done when the reply box is visible on screen.",
        };
      }
      if (context.kind === "study") {
        return {
          instruction: formatInstruction(`Read ${context.object}`),
          fallbackInstruction: formatInstruction("Open the PDF"),
          nextInstruction: formatInstruction("Highlight one sentence"),
          doneWhen: "Done when the first question is visible on screen.",
        };
      }
      return {
        instruction: formatInstruction(
          context.object === "the first error line" ? "Read the first error line" : `Open ${openObject}`,
        ),
        fallbackInstruction: formatInstruction("Open the task note"),
        nextInstruction: formatInstruction("Read the first visible line"),
        doneWhen: "Done when one concrete object is visible on screen.",
      };
  }
};

const EMOTION_CONFIG: Record<
  RecoveryEmotion,
  Omit<ExecutionRecoveryPlan, "microAction">
> = {
  anxious: {
    emotion: "anxious",
    emotionLabel: "Anxious",
    frictionLabel: "fear spike",
    resetMessage: "You do not need to solve the whole task. Restart contact with it.",
    resetDetail: "We are lowering threat first, then making one safe visible move.",
    eftRecommendation: {
      title: "45-second calming EFT",
      subtitle: "Tap to lower pressure before you push.",
      durationLabel: "45 sec",
      actionLabel: "Tap now",
      tappingPoints: ["Side of hand", "Collarbone", "Under eye"],
      href: undefined,
    },
    meditationRecommendation: {
      title: "60-second grounding reset",
      subtitle: "If tapping feels too activating, take a quieter reset.",
      durationLabel: "60 sec",
      actionLabel: "Open video",
      href: toYouTubeSearch("60 second grounding meditation anxiety"),
    },
    battleModeRecommendation: {
      title: "Steady battle mode",
      subtitle: "Low-variance focus pulse to stop rumination loops.",
      durationLabel: "2 min",
      actionLabel: "Open track",
      trackLabel: "Steady cinematic pulse",
      href: toYouTubeSearch("instrumental focus music no lyrics steady cinematic"),
    },
  },
  blocked: {
    emotion: "blocked",
    emotionLabel: "Blocked",
    frictionLabel: "no clear entry point",
    resetMessage: "You do not need clarity first. Find one concrete point of contact.",
    resetDetail: "The goal is not solving the task. The goal is touching one real object.",
    eftRecommendation: {
      title: "30-second unblock EFT",
      subtitle: "Tap while repeating: one concrete move is enough.",
      durationLabel: "30 sec",
      actionLabel: "Tap now",
      tappingPoints: ["Side of hand", "Temple", "Collarbone"],
      href: undefined,
    },
    meditationRecommendation: {
      title: "Clarity reset",
      subtitle: "Short guided breathing to narrow your attention.",
      durationLabel: "60 sec",
      actionLabel: "Open video",
      href: toYouTubeSearch("1 minute focus reset meditation clarity"),
    },
    battleModeRecommendation: {
      title: "Forward motion track",
      subtitle: "A simple pulse for re-entry, not intensity.",
      durationLabel: "2 min",
      actionLabel: "Open track",
      trackLabel: "Forward motion pulse",
      href: toYouTubeSearch("focus music instrumental no lyrics work sprint"),
    },
  },
  tired: {
    emotion: "tired",
    emotionLabel: "Tired",
    frictionLabel: "low energy",
    resetMessage: "Low energy is okay. We are choosing the easiest possible re-entry.",
    resetDetail: "No hard thinking. Just reopen one work surface and let momentum do the rest.",
    eftRecommendation: {
      title: "30-second wake-up EFT",
      subtitle: "Tap lightly and keep your shoulders loose.",
      durationLabel: "30 sec",
      actionLabel: "Tap now",
      tappingPoints: ["Side of hand", "Collarbone", "Under arm"],
      href: undefined,
    },
    meditationRecommendation: {
      title: "One-minute reactivation",
      subtitle: "Short breath cue for foggy attention.",
      durationLabel: "60 sec",
      actionLabel: "Open video",
      href: toYouTubeSearch("1 minute energizing breathing reset work"),
    },
    battleModeRecommendation: {
      title: "Light percussion battle mode",
      subtitle: "Bright pulse to help low-energy re-entry.",
      durationLabel: "2 min",
      actionLabel: "Open track",
      trackLabel: "Bright work pulse",
      href: toYouTubeSearch("upbeat instrumental focus music no lyrics"),
    },
  },
  avoidant: {
    emotion: "avoidant",
    emotionLabel: "Avoidant",
    frictionLabel: "task dread",
    resetMessage: "You are not committing to the whole task. Just touch it once.",
    resetDetail: "Tiny contact beats perfect readiness. One small move is enough.",
    eftRecommendation: {
      title: "45-second self-acceptance EFT",
      subtitle: "Use tapping to lower shame and resistance.",
      durationLabel: "45 sec",
      actionLabel: "Tap now",
      tappingPoints: ["Side of hand", "Collarbone", "Top of head"],
      href: undefined,
    },
    meditationRecommendation: {
      title: "Gentle restart video",
      subtitle: "Use this if your body wants a softer ramp back in.",
      durationLabel: "60 sec",
      actionLabel: "Open video",
      href: toYouTubeSearch("1 minute gentle reset for procrastination"),
    },
    battleModeRecommendation: {
      title: "Commitment battle mode",
      subtitle: "A clean pulse that makes starting feel easier.",
      durationLabel: "2 min",
      actionLabel: "Open track",
      trackLabel: "Commitment pulse",
      href: toYouTubeSearch("battle mode focus music instrumental no lyrics"),
    },
  },
  overwhelmed: {
    emotion: "overwhelmed",
    emotionLabel: "Overwhelmed",
    frictionLabel: "too many moving parts",
    resetMessage: "Shrink the task until there is only one object left.",
    resetDetail: "We are narrowing your attention to a single visible target.",
    eftRecommendation: {
      title: "45-second grounding EFT",
      subtitle: "Tap and repeat: one object only.",
      durationLabel: "45 sec",
      actionLabel: "Tap now",
      tappingPoints: ["Side of hand", "Collarbone", "Under eye"],
      href: undefined,
    },
    meditationRecommendation: {
      title: "Narrowing breath reset",
      subtitle: "Short guided breathing to calm overload.",
      durationLabel: "60 sec",
      actionLabel: "Open video",
      href: toYouTubeSearch("1 minute grounding breath for overwhelm"),
    },
    battleModeRecommendation: {
      title: "Sparse battle mode",
      subtitle: "Low-clutter rhythm for overloaded attention.",
      durationLabel: "2 min",
      actionLabel: "Open track",
      trackLabel: "Sparse pulse",
      href: toYouTubeSearch("minimal instrumental focus music no lyrics"),
    },
  },
  frustrated: {
    emotion: "frustrated",
    emotionLabel: "Frustrated",
    frictionLabel: "agitated resistance",
    resetMessage: "Do not force progress. Capture one visible clue.",
    resetDetail: "Channel the energy into one concrete move instead of fighting the whole task.",
    eftRecommendation: {
      title: "30-second release EFT",
      subtitle: "Tap to reduce heat before you act.",
      durationLabel: "30 sec",
      actionLabel: "Tap now",
      tappingPoints: ["Side of hand", "Under eye", "Collarbone"],
      href: undefined,
    },
    meditationRecommendation: {
      title: "Quick decompression",
      subtitle: "Use this if the pressure feels too hot to work with.",
      durationLabel: "60 sec",
      actionLabel: "Open video",
      href: toYouTubeSearch("1 minute stress relief breathing for work"),
    },
    battleModeRecommendation: {
      title: "Controlled intensity track",
      subtitle: "Heavy enough to channel energy, steady enough to stay useful.",
      durationLabel: "2 min",
      actionLabel: "Open track",
      trackLabel: "Controlled intensity",
      href: toYouTubeSearch("intense instrumental focus music no vocals"),
    },
  },
  distracted: {
    emotion: "distracted",
    emotionLabel: "Distracted",
    frictionLabel: "attention drift",
    resetMessage: "Return to one work surface. Nothing else matters for 2 minutes.",
    resetDetail: "We are not fixing your whole focus. We are recovering one clean work tab.",
    eftRecommendation: {
      title: "20-second refocus EFT",
      subtitle: "A quick tap sequence before re-entry.",
      durationLabel: "20 sec",
      actionLabel: "Tap now",
      tappingPoints: ["Side of hand", "Temple", "Collarbone"],
      href: undefined,
    },
    meditationRecommendation: {
      title: "Refocus video",
      subtitle: "Short guided reset if you need a quick attention reset first.",
      durationLabel: "45 sec",
      actionLabel: "Open video",
      href: toYouTubeSearch("45 second focus reset meditation"),
    },
    battleModeRecommendation: {
      title: "Context switch battle mode",
      subtitle: "Punchy pulse for snapping attention back to work.",
      durationLabel: "2 min",
      actionLabel: "Open track",
      trackLabel: "Context switch cue",
      href: toYouTubeSearch("focus music no lyrics productivity sprint"),
    },
  },
};

export const buildExecutionRecoveryPlan = (input: {
  emotion: string;
  situation: string;
}): ExecutionRecoveryPlan => {
  const emotion = normalizeEmotion(input.emotion, input.situation);
  const context = detectContext(input.situation);
  const config = EMOTION_CONFIG[emotion];

  return {
    ...config,
    microAction: buildMicroAction(emotion, context),
  };
};
