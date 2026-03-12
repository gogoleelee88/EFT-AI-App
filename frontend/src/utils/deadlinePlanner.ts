import { todayInKoreaIso } from "./koreaTime";
import type {
  DeadlineAgendaItem,
  DeadlineGoalAgenda,
  DeadlineChecklistItem,
  DeadlineGoalDraft,
  DeadlineGoalHeadline,
  DeadlineGoalPlan,
  DeadlineGoalSummary,
  DeadlineRepeatRule,
} from "../types/deadlinePlanner";

const ISO_DATE_RX = /^(\d{4})-(\d{2})-(\d{2})$/;
const HHMM_RX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MIN_ITEM_MINUTES = 15;

const ratioTemplates = [
  { label: "요구사항 정리", ratio: 0.18 },
  { label: "핵심 초안 만들기", ratio: 0.34 },
  { label: "세부 구현", ratio: 0.3 },
  { label: "검토 및 제출 준비", ratio: 0.18 },
];

const compactRatioTemplates = [
  { label: "핵심 정리", ratio: 0.3 },
  { label: "본작업 진행", ratio: 0.45 },
  { label: "검토", ratio: 0.25 },
];

const createId = (prefix: string) => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const parseIsoDate = (value: string) => {
  const match = value.match(ISO_DATE_RX);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const formatIsoDate = (value: Date) =>
  `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;

const addDays = (value: string, amount: number) => {
  const parsed = parseIsoDate(value);
  if (!parsed) return value;
  parsed.setDate(parsed.getDate() + amount);
  return formatIsoDate(parsed);
};

const diffDays = (fromIso: string, toIso: string) => {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
};

const normalizeTitle = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const parseMinutes = (label: string) => {
  const match = label.trim().match(HHMM_RX);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const sumMinutes = (items: DeadlineChecklistItem[]) =>
  items.reduce((total, item) => total + item.estMinutes, 0);

export const calculateWindowMinutes = (
  startTime: string,
  endTime: string,
  endsNextDay: boolean
) => {
  const startMinutes = parseMinutes(startTime);
  const endMinutes = parseMinutes(endTime);
  if (startMinutes == null || endMinutes == null) {
    return 60;
  }
  if (endsNextDay) {
    return (24 * 60 - startMinutes) + endMinutes;
  }
  if (endMinutes <= startMinutes) {
    return 60;
  }
  return endMinutes - startMinutes;
};

const matchesRepeatRule = (
  dateIso: string,
  repeat: DeadlineRepeatRule,
  customDays: number[]
) => {
  const parsed = parseIsoDate(dateIso);
  if (!parsed) return true;
  const weekday = parsed.getDay();

  if (repeat === "once") {
    return true;
  }
  if (repeat === "weekdays") {
    return weekday >= 1 && weekday <= 5;
  }
  if (repeat === "weekends") {
    return weekday === 0 || weekday === 6;
  }
  if (repeat === "custom" || repeat === "custom_days") {
    return customDays.includes(weekday);
  }
  return true;
};

export const buildWorkDates = (
  startDate: string,
  deadlineDate: string,
  repeat: DeadlineRepeatRule,
  customDays: number[]
) => {
  const dates: string[] = [];
  if (startDate > deadlineDate) {
    return dates;
  }
  if (repeat === "once") {
    return [deadlineDate];
  }

  let cursor = startDate;
  while (cursor <= deadlineDate) {
    if (matchesRepeatRule(cursor, repeat, customDays)) {
      dates.push(cursor);
    }
    cursor = addDays(cursor, 1);
  }
  return dates;
};

export const buildSuggestedChecklist = (
  title: string,
  totalMinutes: number
): DeadlineChecklistItem[] => {
  const baseTitle = title.trim() || "목표";
  const templates = totalMinutes <= 90 ? compactRatioTemplates : ratioTemplates;
  const safeTotalMinutes = Math.max(totalMinutes, templates.length * MIN_ITEM_MINUTES);

  const rawMinutes = templates.map((template) =>
    Math.max(MIN_ITEM_MINUTES, Math.round(safeTotalMinutes * template.ratio))
  );
  const adjustedMinutes = [...rawMinutes];
  let delta = safeTotalMinutes - adjustedMinutes.reduce((sum, value) => sum + value, 0);
  let index = 0;
  while (delta !== 0 && adjustedMinutes.length > 0) {
    const slot = index % adjustedMinutes.length;
    if (delta > 0) {
      adjustedMinutes[slot] += 1;
      delta -= 1;
    } else if (adjustedMinutes[slot] > MIN_ITEM_MINUTES) {
      adjustedMinutes[slot] -= 1;
      delta += 1;
    }
    index += 1;
    if (index > adjustedMinutes.length * 8) break;
  }

  return templates.map((template, templateIndex) => ({
    id: createId("goal-item"),
    title: `${baseTitle} ${template.label}`,
    estMinutes: adjustedMinutes[templateIndex],
    source: "generated" as const,
  }));
};

const parseManualMinuteHint = (line: string) => {
  const pipeMatch = line.match(/^(.*?)(?:\||\/)\s*(\d+)\s*(?:m|min|분)?\s*$/i);
  if (pipeMatch) {
    return {
      title: pipeMatch[1].trim(),
      minutes: Number(pipeMatch[2]),
    };
  }

  const suffixMatch = line.match(/^(.*?)\s*\((\d+)\s*(?:m|min|분)\)\s*$/i);
  if (suffixMatch) {
    return {
      title: suffixMatch[1].trim(),
      minutes: Number(suffixMatch[2]),
    };
  }

  return {
    title: line.trim(),
    minutes: null,
  };
};

export const parseChecklistText = (
  checklistText: string,
  totalMinutes: number
): DeadlineChecklistItem[] => {
  const lines = checklistText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const parsed = lines.map(parseManualMinuteHint).filter((item) => item.title.length > 0);
  if (parsed.length === 0) {
    return [];
  }

  const specifiedMinutes = parsed.reduce(
    (sum, item) => sum + (item.minutes && item.minutes > 0 ? item.minutes : 0),
    0
  );
  const unspecifiedCount = parsed.filter((item) => !item.minutes || item.minutes <= 0).length;
  const remainingMinutes = Math.max(
    totalMinutes - specifiedMinutes,
    unspecifiedCount * MIN_ITEM_MINUTES
  );
  const defaultMinutes =
    unspecifiedCount > 0
      ? Math.max(MIN_ITEM_MINUTES, Math.round(remainingMinutes / unspecifiedCount))
      : MIN_ITEM_MINUTES;

  return parsed.map((item) => ({
    id: createId("goal-item"),
    title: item.title,
    estMinutes:
      item.minutes && item.minutes > 0 ? Math.max(MIN_ITEM_MINUTES, item.minutes) : defaultMinutes,
    source: "manual" as const,
  }));
};

const buildAssignments = (
  workDates: string[],
  items: DeadlineChecklistItem[],
  capacityMinutes: number
) => {
  const assignments: Record<string, string[]> = {};
  if (workDates.length === 0) {
    return assignments;
  }

  let dayIndex = 0;
  let dayLoad = 0;

  items.forEach((item) => {
    if (dayIndex >= workDates.length) {
      const finalDate = workDates[workDates.length - 1];
      assignments[finalDate] = [...(assignments[finalDate] || []), item.id];
      return;
    }

    if (dayLoad > 0 && dayLoad + item.estMinutes > capacityMinutes && dayIndex < workDates.length - 1) {
      dayIndex += 1;
      dayLoad = 0;
    }

    const dateIso = workDates[dayIndex];
    assignments[dateIso] = [...(assignments[dateIso] || []), item.id];
    dayLoad += item.estMinutes;

    if (dayLoad >= capacityMinutes && dayIndex < workDates.length - 1) {
      dayIndex += 1;
      dayLoad = 0;
    }
  });

  return assignments;
};

const buildCompletionCarryOver = (
  previousPlan: DeadlineGoalPlan | null | undefined,
  nextItems: DeadlineChecklistItem[]
) => {
  if (!previousPlan) {
    return {} as Record<string, string>;
  }

  const completedByTitle = new Map<string, string>();
  previousPlan.items.forEach((item) => {
    const completedAt = previousPlan.completionLog[item.id];
    if (!completedAt) return;
    completedByTitle.set(normalizeTitle(item.title), completedAt);
  });

  return nextItems.reduce<Record<string, string>>((acc, item) => {
    const completedAt = completedByTitle.get(normalizeTitle(item.title));
    if (completedAt) {
      acc[item.id] = completedAt;
    }
    return acc;
  }, {});
};

export const createDeadlineGoalPlan = (
  draft: DeadlineGoalDraft,
  options?: {
    existingPlan?: DeadlineGoalPlan | null;
    nowIso?: string;
  }
): DeadlineGoalPlan => {
  const todayIso = options?.nowIso || todayInKoreaIso();
  const existingPlan = options?.existingPlan || null;
  const startDate = draft.startDate || todayIso;
  const deadlineDate = draft.deadlineDate || startDate;
  const workDates = buildWorkDates(startDate, deadlineDate, draft.repeat, draft.customDays);
  const capacityMinutes = Math.max(
    MIN_ITEM_MINUTES,
    calculateWindowMinutes(draft.windowStartTime, draft.windowEndTime, draft.endsNextDay)
  );
  const parsedItems = parseChecklistText(draft.checklistText, draft.totalMinutes);
  const items =
    parsedItems.length > 0
      ? parsedItems
      : buildSuggestedChecklist(draft.title, Math.max(draft.totalMinutes, capacityMinutes));

  const assignments = buildAssignments(workDates, items, capacityMinutes);
  const completionLog = buildCompletionCarryOver(existingPlan, items);
  const timestamp = new Date().toISOString();

  return {
    id: existingPlan?.id || createId("goal"),
    title: draft.title.trim(),
    startDate,
    deadlineDate,
    windowStartTime: draft.windowStartTime,
    windowEndTime: draft.windowEndTime,
    endsNextDay: draft.endsNextDay,
    repeat: draft.repeat,
    customDays: [...draft.customDays],
    totalMinutes: Math.max(draft.totalMinutes, sumMinutes(items)),
    items,
    assignments,
    completionLog,
    syncedDates: existingPlan?.syncedDates || [],
    createdAt: existingPlan?.createdAt || timestamp,
    updatedAt: timestamp,
    lastOpenedAt: existingPlan?.lastOpenedAt || null,
  };
};

const getItemsById = (plan: DeadlineGoalPlan) =>
  new Map(plan.items.map((item) => [item.id, item]));

const isCompleted = (plan: DeadlineGoalPlan, itemId: string) => Boolean(plan.completionLog[itemId]);

const uniqueItems = (items: DeadlineAgendaItem[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

export const getGoalAgendaForDate = (
  plan: DeadlineGoalPlan,
  dateIso: string
): DeadlineGoalAgenda => {
  const itemMap = getItemsById(plan);
  const overdueItems: DeadlineAgendaItem[] = [];
  const todayItems: DeadlineAgendaItem[] = [];

  Object.entries(plan.assignments).forEach(([assignedDate, itemIds]) => {
    itemIds.forEach((itemId) => {
      if (isCompleted(plan, itemId)) return;
      const item = itemMap.get(itemId);
      if (!item) return;
      if (assignedDate < dateIso) {
        overdueItems.push({ ...item, lane: "overdue" });
      } else if (assignedDate === dateIso) {
        todayItems.push({ ...item, lane: "today" });
      }
    });
  });

  const pendingItems = uniqueItems([...overdueItems, ...todayItems]);
  const todayAssignedIds = plan.assignments[dateIso] || [];
  const completedTodayCount = todayAssignedIds.filter((itemId) => isCompleted(plan, itemId)).length;
  const todayAssignedMinutes = todayAssignedIds.reduce((sum, itemId) => {
    const item = itemMap.get(itemId);
    return sum + (item?.estMinutes || 0);
  }, 0);
  const capacityMinutes = calculateWindowMinutes(
    plan.windowStartTime,
    plan.windowEndTime,
    plan.endsNextDay
  );
  const nextDate = Object.keys(plan.assignments)
    .filter((assignedDate) => assignedDate > dateIso)
    .sort()[0];
  const nextItems = nextDate
    ? (plan.assignments[nextDate] || [])
        .filter((itemId) => !isCompleted(plan, itemId))
        .map((itemId) => itemMap.get(itemId))
        .filter((item): item is DeadlineChecklistItem => Boolean(item))
    : [];
  const allVisibleDone =
    pendingItems.length === 0 &&
    (todayAssignedIds.length > 0 ||
      Object.keys(plan.assignments).some((assignedDate) => assignedDate < dateIso));

  return {
    date: dateIso,
    pendingItems,
    completedTodayCount,
    overdueCount: overdueItems.length,
    remainingCapacityMinutes: allVisibleDone
      ? Math.max(0, capacityMinutes - todayAssignedMinutes)
      : 0,
    nextDate: nextDate || null,
    nextItems,
    allVisibleDone,
  };
};

export const toggleGoalChecklistItem = (
  plan: DeadlineGoalPlan,
  itemId: string,
  completedAt: string = new Date().toISOString()
): DeadlineGoalPlan => {
  const nextCompletionLog = { ...plan.completionLog };
  if (nextCompletionLog[itemId]) {
    delete nextCompletionLog[itemId];
  } else {
    nextCompletionLog[itemId] = completedAt;
  }
  return {
    ...plan,
    completionLog: nextCompletionLog,
    updatedAt: new Date().toISOString(),
  };
};

export const pullGoalItemsForward = (
  plan: DeadlineGoalPlan,
  dateIso: string
): DeadlineGoalPlan => {
  const agenda = getGoalAgendaForDate(plan, dateIso);
  if (
    !agenda.allVisibleDone ||
    agenda.remainingCapacityMinutes <= 0 ||
    !agenda.nextDate ||
    agenda.nextItems.length === 0
  ) {
    return plan;
  }

  const nextAssignments = { ...plan.assignments };
  const todayIds = [...(nextAssignments[dateIso] || [])];
  const futureIds = [...(nextAssignments[agenda.nextDate] || [])];
  let remainingMinutes = agenda.remainingCapacityMinutes;
  const movedIds: string[] = [];

  for (const item of agenda.nextItems) {
    if (remainingMinutes <= 0 && movedIds.length > 0) break;
    if (item.estMinutes > remainingMinutes && movedIds.length > 0) continue;
    movedIds.push(item.id);
    remainingMinutes = Math.max(0, remainingMinutes - item.estMinutes);
  }

  if (movedIds.length === 0) {
    return plan;
  }

  nextAssignments[dateIso] = [...todayIds, ...movedIds];
  nextAssignments[agenda.nextDate] = futureIds.filter((itemId) => !movedIds.includes(itemId));

  return {
    ...plan,
    assignments: nextAssignments,
    updatedAt: new Date().toISOString(),
  };
};

export const getGoalCompletionRate = (plan: DeadlineGoalPlan) => {
  if (plan.items.length === 0) return 0;
  return Math.round((Object.keys(plan.completionLog).length / plan.items.length) * 100);
};

const getOverdueCount = (plan: DeadlineGoalPlan, todayIso: string) =>
  getGoalAgendaForDate(plan, todayIso).overdueCount;

export const getGoalHatchProbability = (
  plan: DeadlineGoalPlan,
  todayIso: string = todayInKoreaIso()
) => {
  const completionRate = getGoalCompletionRate(plan);
  const overdueCount = getOverdueCount(plan, todayIso);
  const inactiveDays = plan.lastOpenedAt
    ? Math.max(0, diffDays(plan.lastOpenedAt.slice(0, 10), todayIso))
    : 2;
  const dueInDays = diffDays(todayIso, plan.deadlineDate);
  const urgencyPenalty = dueInDays < 0 ? 18 : dueInDays <= 1 ? 10 : dueInDays <= 3 ? 4 : 0;
  const probability = Math.round(
    34 +
      completionRate * 0.46 -
      overdueCount * 8 -
      inactiveDays * 6 -
      urgencyPenalty
  );
  return Math.max(3, Math.min(99, probability));
};

export const getGoalHatchStage = (probability: number) => {
  if (probability >= 85) return "부화 직전";
  if (probability >= 65) return "금빛 알";
  if (probability >= 45) return "안정 알";
  return "준비 알";
};

export const buildGoalDriftMessage = (
  plan: DeadlineGoalPlan,
  todayIso: string = todayInKoreaIso()
) => {
  const agenda = getGoalAgendaForDate(plan, todayIso);
  const inactiveDays = plan.lastOpenedAt
    ? Math.max(0, diffDays(plan.lastOpenedAt.slice(0, 10), todayIso))
    : 2;

  if (agenda.overdueCount > 0 || inactiveDays >= 2) {
    return "목표의 부화확률이 조금 멀어졌습니다.";
  }
  return null;
};

export const buildGoalSummary = (
  plan: DeadlineGoalPlan,
  todayIso: string = todayInKoreaIso()
): DeadlineGoalSummary => {
  const completionRate = getGoalCompletionRate(plan);
  const overdueCount = getOverdueCount(plan, todayIso);
  const hatchProbability = getGoalHatchProbability(plan, todayIso);

  return {
    planId: plan.id,
    title: plan.title,
    dDay: diffDays(todayIso, plan.deadlineDate),
    completionRate,
    completedCount: Object.keys(plan.completionLog).length,
    totalCount: plan.items.length,
    overdueCount,
    hatchProbability,
    hatchStage: getGoalHatchStage(hatchProbability),
    driftMessage: buildGoalDriftMessage(plan, todayIso),
  };
};

export const isGoalComplete = (plan: DeadlineGoalPlan) =>
  Object.keys(plan.completionLog).length >= plan.items.length && plan.items.length > 0;

export const buildTodayGoalHeadline = (
  plans: DeadlineGoalPlan[],
  todayIso: string = todayInKoreaIso()
): DeadlineGoalHeadline | null => {
  const activePlans = plans
    .filter((plan) => !isGoalComplete(plan))
    .map((plan) => ({
      plan,
      agenda: getGoalAgendaForDate(plan, todayIso),
      summary: buildGoalSummary(plan, todayIso),
    }))
    .filter(({ agenda }) => agenda.pendingItems.length > 0 || agenda.nextItems.length > 0);

  if (activePlans.length === 0) {
    return null;
  }

  activePlans.sort((left, right) => {
    if (left.summary.overdueCount !== right.summary.overdueCount) {
      return right.summary.overdueCount - left.summary.overdueCount;
    }
    if (left.summary.dDay !== right.summary.dDay) {
      return left.summary.dDay - right.summary.dDay;
    }
    return left.summary.hatchProbability - right.summary.hatchProbability;
  });

  return activePlans[0];
};

export const touchGoalPlans = (
  plans: DeadlineGoalPlan[],
  timestamp: string = new Date().toISOString()
) =>
  plans.map((plan) => ({
    ...plan,
    lastOpenedAt: timestamp,
  }));

export const toChecklistEditorText = (plan: DeadlineGoalPlan) =>
  plan.items.map((item) => `${item.title} | ${item.estMinutes}`).join("\n");

export const buildLocalGoalNotification = (
  plan: DeadlineGoalPlan,
  todayIso: string = todayInKoreaIso()
) => {
  const agenda = getGoalAgendaForDate(plan, todayIso);
  const summary = buildGoalSummary(plan, todayIso);
  return {
    title: summary.driftMessage ? "부화 확률 점검" : plan.title,
    body: summary.driftMessage
      ? `${summary.driftMessage} 오늘 체크리스트부터 다시 붙잡아 주세요.`
      : agenda.pendingItems.length > 0
      ? `${agenda.pendingItems[0].title}${agenda.pendingItems.length > 1 ? ` 외 ${agenda.pendingItems.length - 1}개` : ""}`
      : `${plan.title}의 다음 분량을 앞당길 수 있습니다.`,
  };
};
