import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BellPlus,
  CalendarClock,
  CheckCircle2,
  Egg,
  Inbox,
  LoaderCircle,
  LogOut,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import Card from "../components/ui/Card";
import { useAuth } from "../hooks/useAuth";
import { useDeadlineGoals } from "../hooks/useDeadlineGoals";
import {
  getAspirationProfile,
  getCapabilityProfile,
  saveProfileBundle,
} from "../services/profileService";
import type { CapabilityProfilePayload, AspirationProfilePayload } from "../types/proposalOS";
import { buildPlannerHref } from "../utils/plannerRoutes";
import {
  buildProfileCompletion,
  buildProfileReadiness,
  EMPTY_MY_PAGE_FORM,
  hasProfileContent,
  joinLines,
  normalizeMyPageForm,
  splitLines,
  type MyPageFormState,
} from "./myPage.utils";

type MyPageDraft = {
  form: MyPageFormState;
  updatedAt: string;
};

const DRAFT_STORAGE_PREFIX = "eft.my-page.draft.v1";

const buildDraftKey = (userId: string) => `${DRAFT_STORAGE_PREFIX}:${userId}`;

const readDraft = (userId: string): MyPageDraft | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(buildDraftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MyPageDraft;
    if (!parsed?.form) return null;
    return {
      form: normalizeMyPageForm({ ...EMPTY_MY_PAGE_FORM, ...parsed.form }),
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

const writeDraft = (userId: string, draft: MyPageDraft) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(buildDraftKey(userId), JSON.stringify(draft));
  } catch {
    // Ignore storage quota failures.
  }
};

const clearDraft = (userId: string) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(buildDraftKey(userId));
  } catch {
    // Ignore storage failures.
  }
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "None";
  if (!value) return "없음";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const formFromProfiles = (
  aspiration: Partial<AspirationProfilePayload> | null,
  capability: Partial<CapabilityProfilePayload> | null
): MyPageFormState =>
  normalizeMyPageForm({
    aspirationStatement: aspiration?.aspiration_statement ?? "",
    targetIdentity: aspiration?.target_identity ?? "",
    northStarGoal: aspiration?.north_star_goal ?? "",
    horizon90dText: joinLines(aspiration?.horizon_90d),
    valuesText: joinLines(aspiration?.values),
    constraintsText: joinLines(aspiration?.constraints),
    strengthsText: joinLines(capability?.strengths),
    experienceText: joinLines(capability?.experience_highlights),
    domainFocusText: joinLines(capability?.domain_focus),
    certificationsText: joinLines(capability?.certifications),
    toolStackText: joinLines(capability?.tool_stack),
  });

const FieldShell: React.FC<{
  label: string;
  description: string;
  required?: boolean;
  children: React.ReactNode;
}> = ({ label, description, required = false, children }) => (
  <label className="space-y-2">
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-slate-900">{label}</span>
      {required && (
        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
          필수
        </span>
      )}
    </div>
    <p className="text-xs leading-5 text-slate-500">{description}</p>
    {children}
  </label>
);

const TextInput: React.FC<{
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}> = ({ value, placeholder, onChange }) => (
  <input
    value={value}
    placeholder={placeholder}
    onChange={(event) => onChange(event.target.value)}
    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
  />
);

const TextAreaInput: React.FC<{
  value: string;
  placeholder: string;
  rows?: number;
  onChange: (value: string) => void;
}> = ({ value, placeholder, rows = 4, onChange }) => (
  <textarea
    value={value}
    rows={rows}
    placeholder={placeholder}
    onChange={(event) => onChange(event.target.value)}
    className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
  />
);

const StatusChip: React.FC<{
  label: string;
  tone: "ready" | "pending";
}> = ({ label, tone }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
      tone === "ready"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-amber-100 text-amber-700"
    }`}
  >
    {tone === "ready" ? (
      <CheckCircle2 className="h-3.5 w-3.5" />
    ) : (
      <AlertCircle className="h-3.5 w-3.5" />
    )}
    {label}
  </span>
);

const QuickActionCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}> = ({ icon, title, description, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="group relative flex w-full items-start justify-between overflow-hidden rounded-[30px] border border-slate-200 bg-[linear-gradient(145deg,_rgba(255,255,255,0.96),_rgba(241,245,249,0.9))] p-5 text-left shadow-[0_16px_40px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:border-sky-300 hover:shadow-[0_24px_60px_rgba(14,165,233,0.16)]"
  >
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300 to-transparent opacity-70" />
    <div className="space-y-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-900/15 transition group-hover:scale-105">
        {icon}
      </div>
      <div>
        <div className="text-sm font-semibold tracking-[0.01em] text-slate-950">{title}</div>
        <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
      </div>
    </div>
    <ArrowRight className="mt-1 h-4 w-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-sky-600" />
  </button>
);

const MyPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, logout } = useAuth();
  const { summaries } = useDeadlineGoals(user?.uid);

  const [form, setForm] = useState<MyPageFormState>(EMPTY_MY_PAGE_FORM);
  const [savedSnapshot, setSavedSnapshot] =
    useState<MyPageFormState>(EMPTY_MY_PAGE_FORM);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [restorableDraft, setRestorableDraft] = useState<MyPageDraft | null>(null);
  const [isReadyForDrafts, setIsReadyForDrafts] = useState(false);

  const normalizedForm = useMemo(() => normalizeMyPageForm(form), [form]);
  const completion = useMemo(
    () => buildProfileCompletion(normalizedForm),
    [normalizedForm]
  );
  const readiness = useMemo(
    () => buildProfileReadiness(normalizedForm),
    [normalizedForm]
  );
  const topGoalSummaries = useMemo(() => summaries.slice(0, 3), [summaries]);
  const hasUnsavedChanges =
    JSON.stringify(normalizedForm) !== JSON.stringify(savedSnapshot);

  useEffect(() => {
    if (!user?.uid) {
      setLoadingProfile(false);
      setIsReadyForDrafts(false);
      return;
    }

    let cancelled = false;
    const draft = readDraft(user.uid);

    setLoadingProfile(true);
    setLoadError(null);
    setSaveNotice(null);

    Promise.all([
      getAspirationProfile(user.uid),
      getCapabilityProfile(user.uid),
    ])
      .then(([aspiration, capability]) => {
        if (cancelled) return;
        const nextForm = formFromProfiles(aspiration, capability);
        setForm(nextForm);
        setSavedSnapshot(nextForm);
        setRestorableDraft(
          draft &&
            JSON.stringify(normalizeMyPageForm(draft.form)) !==
              JSON.stringify(nextForm)
            ? draft
            : null
        );
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "프로필을 불러오는 중 오류가 발생했습니다."
        );
        setForm(EMPTY_MY_PAGE_FORM);
        setSavedSnapshot(EMPTY_MY_PAGE_FORM);
        setRestorableDraft(draft);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingProfile(false);
        setIsReadyForDrafts(true);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || !isReadyForDrafts) return;

    const timer = window.setTimeout(() => {
      if (!hasUnsavedChanges || !hasProfileContent(normalizedForm)) {
        if (!hasProfileContent(normalizedForm)) {
          clearDraft(user.uid);
          setDraftSavedAt(null);
        }
        return;
      }

      const nextDraft = {
        form: normalizedForm,
        updatedAt: new Date().toISOString(),
      };
      writeDraft(user.uid, nextDraft);
      setDraftSavedAt(nextDraft.updatedAt);
    }, 500);

    return () => window.clearTimeout(timer);
  }, [hasUnsavedChanges, isReadyForDrafts, normalizedForm, user?.uid]);

  const updateField = (key: keyof MyPageFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveError(null);
    setSaveNotice(null);
  };

  const handleRestoreDraft = () => {
    if (!restorableDraft) return;
    setForm(normalizeMyPageForm(restorableDraft.form));
    setDraftSavedAt(restorableDraft.updatedAt);
    setRestorableDraft(null);
    setSaveNotice("로컬 초안을 복원했습니다.");
  };

  const handleResetToServer = () => {
    setForm(savedSnapshot);
    setSaveError(null);
    setSaveNotice("마지막 서버 저장 상태로 되돌렸습니다.");
  };

  const handleSave = async () => {
    if (!user?.uid) return;

    if (normalizedForm.aspirationStatement.trim().length < 3) {
      setSaveError("북극성 한 줄은 3자 이상으로 입력해 주세요.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveNotice(null);

    try {
      const aspirationPayload: AspirationProfilePayload = {
        user_id: user.uid,
        aspiration_statement: normalizedForm.aspirationStatement,
        target_identity: normalizedForm.targetIdentity || undefined,
        north_star_goal: normalizedForm.northStarGoal || undefined,
        horizon_90d: splitLines(normalizedForm.horizon90dText),
        values: splitLines(normalizedForm.valuesText),
        constraints: splitLines(normalizedForm.constraintsText),
      };

      const capabilityPayload: CapabilityProfilePayload = {
        user_id: user.uid,
        strengths: splitLines(normalizedForm.strengthsText),
        experience_highlights: splitLines(normalizedForm.experienceText),
        domain_focus: splitLines(normalizedForm.domainFocusText),
        certifications: splitLines(normalizedForm.certificationsText),
        tool_stack: splitLines(normalizedForm.toolStackText),
      };

      await saveProfileBundle({
        aspiration: aspirationPayload,
        capability: capabilityPayload,
      });

      setSavedSnapshot(normalizedForm);
      setLastSavedAt(new Date().toISOString());
      setDraftSavedAt(null);
      clearDraft(user.uid);
      setRestorableDraft(null);
      setSaveNotice("마이페이지를 저장했습니다.");
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "프로필 저장 중 오류가 발생했습니다."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  if (authLoading || loadingProfile) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6">
          <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <LoaderCircle className="h-5 w-5 animate-spin text-sky-600" />
            <span className="text-sm font-medium text-slate-700">
              마이페이지를 준비하고 있습니다.
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-6">
          <Card className="w-full rounded-[28px] border-slate-200 p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <UserRound className="h-6 w-6" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold text-slate-900">
              로그인이 필요합니다
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              계정 정보와 목표를 저장하려면 먼저 로그인해 주세요.
            </p>
            <Button
              variant="primary"
              size="lg"
              className="mt-6"
              onClick={() => navigate("/login")}
            >
              로그인
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_32%),linear-gradient(180deg,_#f8fbff_0%,_#eef5ff_45%,_#f8fafc_100%)] pb-28">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.95fr]">
          <Card className="overflow-hidden rounded-[36px] border-slate-200 bg-[linear-gradient(135deg,_rgba(14,165,233,0.12),_rgba(255,255,255,0.98)_38%,_rgba(16,185,129,0.08))] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
              <div className="space-y-4">
                <span className="inline-flex items-center gap-2 rounded-full bg-sky-100/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  Profile OS
                </span>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2.3rem]">
                    Build the profile that drives every execution decision
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    This page now behaves like a personal operating system. Identity, strengths,
                    constraints, and execution evidence are shaped here first, then reused by
                    Alarm Studio, planning, and recommendation flows across the app.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[28px] border border-white/70 bg-white/85 px-4 py-4 shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Identity
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {readiness.identity ? "Ready for strategic use" : "Needs sharper direction"}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      Aspiration, target role, and north star framing.
                    </div>
                  </div>
                  <div className="rounded-[28px] border border-white/70 bg-white/85 px-4 py-4 shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Plan Layer
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {readiness.plan ? "Roadmap is structured" : "Roadmap needs shaping"}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      Values, constraints, and 90-day direction.
                    </div>
                  </div>
                  <div className="rounded-[28px] border border-white/70 bg-white/85 px-4 py-4 shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Execution
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {readiness.execution ? "Signals are usable" : "Signals are still thin"}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      Strengths, tools, and proof of delivery.
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <StatusChip
                    label={readiness.identity ? "Identity ready" : "Identity needs work"}
                    tone={readiness.identity ? "ready" : "pending"}
                  />
                  <StatusChip
                    label={readiness.plan ? "Plan layer ready" : "Plan layer needs work"}
                    tone={readiness.plan ? "ready" : "pending"}
                  />
                  <StatusChip
                    label={readiness.execution ? "Execution signals ready" : "Execution needs work"}
                    tone={readiness.execution ? "ready" : "pending"}
                  />
                </div>
              </div>

              <div className="grid gap-4">
                <div className="rounded-[32px] border border-slate-200/70 bg-[linear-gradient(180deg,_#020617_0%,_#111827_52%,_#0f172a_100%)] p-5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.32)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-[0.18em] text-sky-200">
                        Profile Readiness
                      </div>
                      <div className="mt-2 text-4xl font-semibold">{completion}%</div>
                    </div>
                    <div className="rounded-2xl bg-white/10 p-3">
                      <Target className="h-5 w-5 text-sky-200" />
                    </div>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300"
                      style={{ width: `${completion}%` }}
                    />
                  </div>
                  <div className="mt-5 grid gap-3 text-xs text-slate-300">
                    <div className="rounded-2xl bg-white/5 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                        Last Publish
                      </div>
                      <div className="mt-1 text-sm text-white">{formatDateTime(lastSavedAt)}</div>
                    </div>
                    <div className="rounded-2xl bg-white/5 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                        Local Draft
                      </div>
                      <div className="mt-1 text-sm text-white">{formatDateTime(draftSavedAt)}</div>
                    </div>
                    <div className="rounded-2xl bg-white/5 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                        Account
                      </div>
                      <div className="mt-1 break-all text-sm text-white">{user.email || user.uid}</div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[28px] border border-slate-200 bg-white/85 px-4 py-4 shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Active Goals
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">
                      {topGoalSummaries.length}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      Live deadline programs currently influencing execution.
                    </div>
                  </div>
                  <div className="rounded-[28px] border border-slate-200 bg-white/85 px-4 py-4 shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Sync State
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {hasUnsavedChanges ? "Profile changed locally" : "Profile synced to source"}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      Keep this layer clean before you generate alarms or recommendations.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <QuickActionCard
              icon={<BellPlus className="h-5 w-5" />}
              title="Open Alarm Studio"
              description="Turn this profile into a precise execution alarm with sync and privacy rules."
              onClick={() => navigate("/add-alarm")}
            />
            <QuickActionCard
              icon={<Inbox className="h-5 w-5" />}
              title="Review Signal Inbox"
              description="Inspect recent loops and pressure signals before choosing the next move."
              onClick={() => navigate("/signal-inbox")}
            />
            <QuickActionCard
              icon={<CalendarClock className="h-5 w-5" />}
              title="Open Planner Workspace"
              description="Move into the live execution board once your profile layer is ready to drive decisions."
              onClick={() => navigate(buildPlannerHref("today"))}
            />
          </div>

          <Card className="hidden rounded-[32px] border-slate-200 bg-white/85 p-6 backdrop-blur">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <span className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  프로필 오퍼레이팅 룸
                </span>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                    마이페이지
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    목표, 강점, 실행 조건을 한 화면에서 관리합니다. 이 정보는
                    제안 생성, 일정 추천, 알람 설계의 기본 컨텍스트로 사용됩니다.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <StatusChip
                    label={readiness.identity ? "정체성 입력 완료" : "정체성 입력 필요"}
                    tone={readiness.identity ? "ready" : "pending"}
                  />
                  <StatusChip
                    label={readiness.plan ? "90일 계획 정리됨" : "90일 계획 보완 필요"}
                    tone={readiness.plan ? "ready" : "pending"}
                  />
                  <StatusChip
                    label={readiness.execution ? "실행 역량 정리됨" : "실행 역량 보완 필요"}
                    tone={readiness.execution ? "ready" : "pending"}
                  />
                </div>
              </div>

              <div className="min-w-[220px] rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-sky-200">
                      Profile Health
                    </div>
                    <div className="mt-2 text-4xl font-semibold">{completion}%</div>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3">
                    <Target className="h-5 w-5 text-sky-200" />
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300"
                    style={{ width: `${completion}%` }}
                  />
                </div>
                <div className="mt-4 space-y-2 text-xs text-slate-300">
                  <div>마지막 저장: {formatDateTime(lastSavedAt)}</div>
                  <div>로컬 초안: {formatDateTime(draftSavedAt)}</div>
                  <div>계정: {user.email || user.uid}</div>
                </div>
              </div>
            </div>
          </Card>

          <div className="hidden grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <QuickActionCard
              icon={<BellPlus className="h-5 w-5" />}
              title="알람 만들기"
              description="프로필 정보를 바탕으로 오늘 실행 알람을 설계합니다."
              onClick={() => navigate("/add-alarm")}
            />
            <QuickActionCard
              icon={<Inbox className="h-5 w-5" />}
              title="신호함 열기"
              description="수집된 신호와 회복 데이터를 보고 다음 액션을 조정합니다."
              onClick={() => navigate("/signal-inbox")}
            />
            <QuickActionCard
              icon={<LayoutDashboard className="h-5 w-5" />}
              title="대시보드 보기"
              description="최근 기록과 리포트를 확인하고 전체 흐름을 점검합니다."
              onClick={() => navigate("/dashboard")}
            />
          </div>
        </div>

        {restorableDraft && (
          <div className="mt-4 rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold">복원 가능한 로컬 초안이 있습니다.</div>
                <div className="mt-1 text-xs text-amber-700">
                  마지막 수정 시각 {formatDateTime(restorableDraft.updatedAt)}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setRestorableDraft(null)}>
                  무시
                </Button>
                <Button variant="primary" size="sm" onClick={handleRestoreDraft}>
                  초안 복원
                </Button>
              </div>
            </div>
          </div>
        )}

        {loadError && (
          <div className="mt-4 rounded-[28px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {loadError}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <Card className="rounded-[32px] border-slate-200 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <Egg className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">목표 알</h2>
                  <p className="text-sm text-slate-500">
                    마감 플랜의 디데이, 달성률, 부화 확률을 한 번에 봅니다.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {topGoalSummaries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    아직 저장된 마감 플랜이 없습니다.
                  </div>
                ) : (
                  topGoalSummaries.map((summary) => (
                    <div
                      key={summary.planId}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {summary.title}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {summary.dDay >= 0
                              ? `D-${summary.dDay}`
                              : `D+${Math.abs(summary.dDay)}`}{" "}
                            · {summary.completedCount}/{summary.totalCount} 완료
                          </div>
                        </div>
                        <div className="rounded-2xl bg-slate-950 px-3 py-2 text-right text-white">
                          <div className="text-[11px] uppercase tracking-wide text-sky-200">
                            Hatch
                          </div>
                          <div className="mt-1 text-lg font-semibold">
                            {summary.hatchProbability}%
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400"
                          style={{ width: `${summary.completionRate}%` }}
                        />
                      </div>
                      {summary.driftMessage && (
                        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          {summary.driftMessage}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5">
                <Button
                  variant="outline"
                  size="md"
                  fullWidth
                  onClick={() => navigate("/deadline-planner")}
                >
                  마감 플래너 열기
                </Button>
              </div>
            </Card>

            <Card className="rounded-[32px] border-slate-200 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">
                    정체성과 목표
                  </h2>
                  <p className="text-sm text-slate-500">
                    제안 생성과 우선순위 추천의 기준이 되는 정보입니다.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-5">
                <FieldShell
                  label="북극성 한 줄"
                  description="지금 이 계정이 향하는 방향을 한 문장으로 적습니다."
                  required
                >
                  <TextAreaInput
                    rows={3}
                    value={form.aspirationStatement}
                    placeholder="예: 감정 기복에 흔들리지 않고 매일 실행을 쌓는 사람"
                    onChange={(value) => updateField("aspirationStatement", value)}
                  />
                </FieldShell>

                <div className="grid gap-5 md:grid-cols-2">
                  <FieldShell
                    label="목표 정체성"
                    description="스스로를 어떤 사람으로 만들고 싶은지 적습니다."
                  >
                    <TextInput
                      value={form.targetIdentity}
                      placeholder="예: 집중력이 안정적인 운영자"
                      onChange={(value) => updateField("targetIdentity", value)}
                    />
                  </FieldShell>

                  <FieldShell
                    label="North Star Goal"
                    description="중장기 목표를 짧고 분명하게 남깁니다."
                  >
                    <TextInput
                      value={form.northStarGoal}
                      placeholder="예: 2026년 말까지 핵심 제품 매출 2배"
                      onChange={(value) => updateField("northStarGoal", value)}
                    />
                  </FieldShell>
                </div>

                <FieldShell
                  label="90일 목표"
                  description="한 줄에 하나씩 적어 주세요. 쉼표로도 구분할 수 있습니다."
                >
                  <TextAreaInput
                    value={form.horizon90dText}
                    placeholder={"핵심 습관 1개 정착\n핵심 기능 3개 출시\n주간 리뷰 체계 만들기"}
                    onChange={(value) => updateField("horizon90dText", value)}
                  />
                </FieldShell>

                <div className="grid gap-5 md:grid-cols-2">
                  <FieldShell
                    label="핵심 가치"
                    description="의사결정에서 절대 놓치지 않을 기준입니다."
                  >
                    <TextAreaInput
                      rows={4}
                      value={form.valuesText}
                      placeholder={"정직함\n지속 가능성\n실행 우선"}
                      onChange={(value) => updateField("valuesText", value)}
                    />
                  </FieldShell>

                  <FieldShell
                    label="제약 조건"
                    description="현실적으로 고려해야 할 제한 요소를 적습니다."
                  >
                    <TextAreaInput
                      rows={4}
                      value={form.constraintsText}
                      placeholder={"오전 9시 이전 집중 시간 확보\n주 2회 외부 미팅"}
                      onChange={(value) => updateField("constraintsText", value)}
                    />
                  </FieldShell>
                </div>
              </div>
            </Card>

            <Card className="rounded-[32px] border-slate-200 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">
                    실행 역량과 자산
                  </h2>
                  <p className="text-sm text-slate-500">
                    추천 시스템이 어떤 방식으로 도와야 하는지 정하는 데이터입니다.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-5">
                <div className="grid gap-5 md:grid-cols-2">
                  <FieldShell
                    label="핵심 강점"
                    description="이미 잘하고 있는 점을 자산으로 명시합니다."
                  >
                    <TextAreaInput
                      value={form.strengthsText}
                      placeholder={"빠른 의사결정\n문제 구조화\n카피라이팅"}
                      onChange={(value) => updateField("strengthsText", value)}
                    />
                  </FieldShell>

                  <FieldShell
                    label="도메인 집중 영역"
                    description="현재 집중하는 산업이나 문제 영역을 정리합니다."
                  >
                    <TextAreaInput
                      value={form.domainFocusText}
                      placeholder={"AI 제품\n정서 케어\n모바일 성장"}
                      onChange={(value) => updateField("domainFocusText", value)}
                    />
                  </FieldShell>
                </div>

                <FieldShell
                  label="경험 하이라이트"
                  description="반복해서 참고할 만한 이력이나 성과를 적습니다."
                >
                  <TextAreaInput
                    value={form.experienceText}
                    placeholder={"프로덕트 런칭 3회\n운영 체계 전환 경험\n브랜딩 리뉴얼"}
                    onChange={(value) => updateField("experienceText", value)}
                  />
                </FieldShell>

                <div className="grid gap-5 md:grid-cols-2">
                  <FieldShell
                    label="자격/인증"
                    description="공신력이나 전문성을 나타내는 항목을 남깁니다."
                  >
                    <TextAreaInput
                      rows={4}
                      value={form.certificationsText}
                      placeholder={"GAIQ\nSQLD\n관련 수료 이력"}
                      onChange={(value) => updateField("certificationsText", value)}
                    />
                  </FieldShell>

                  <FieldShell
                    label="툴 스택"
                    description="실제 작업에 쓰는 툴을 적어 두면 실행 제안 품질이 좋아집니다."
                  >
                    <TextAreaInput
                      rows={4}
                      value={form.toolStackText}
                      placeholder={"Notion\nFigma\nReact\nFirebase"}
                      onChange={(value) => updateField("toolStackText", value)}
                    />
                  </FieldShell>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-[32px] border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-950">계정 상태</h2>
              <div className="mt-5 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-lg font-semibold text-white">
                    {(user.name || user.email || "U").slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {user.name || "사용자"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {user.email || "이메일 정보 없음"}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      UID: {user.uid}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Level
                    </div>
                    <div className="mt-1 text-xl font-semibold text-slate-900">
                      {user.level}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Streak
                    </div>
                    <div className="mt-1 text-xl font-semibold text-slate-900">
                      {user.streak}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Badges
                    </div>
                    <div className="mt-1 text-xl font-semibold text-slate-900">
                      {user.badges}
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="rounded-[32px] border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-950">운영 메모</h2>
              <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                <p>
                  마이페이지 정보는 제안 생성, 일정 추천, 알람 제목과 설명 품질에
                  직접 반영됩니다.
                </p>
                <p>
                  민감한 정보는 필요한 수준까지만 입력하세요. 외부 공유가 걱정되면
                  알람 생성 시 `앱 전용` 또는 `마스킹` 모드를 선택하면 됩니다.
                </p>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <StatusChip
                  label={hasUnsavedChanges ? "저장 전 변경 있음" : "서버와 동기화됨"}
                  tone={hasUnsavedChanges ? "pending" : "ready"}
                />
                <StatusChip
                  label={completion >= 70 ? "추천 품질 양호" : "추천 품질 보완 필요"}
                  tone={completion >= 70 ? "ready" : "pending"}
                />
              </div>
            </Card>

            <Card className="rounded-[32px] border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-950">계정 액션</h2>
              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  onClick={handleResetToServer}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm text-slate-700 transition hover:border-sky-300 hover:bg-sky-50"
                >
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    서버 저장 상태로 되돌리기
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center justify-between rounded-2xl border border-rose-200 px-4 py-3 text-left text-sm text-rose-700 transition hover:bg-rose-50"
                >
                  <span className="inline-flex items-center gap-2">
                    <LogOut className="h-4 w-4" />
                    로그아웃
                  </span>
                  <ArrowRight className="h-4 w-4 text-rose-400" />
                </button>
              </div>
            </Card>
          </div>
        </div>

        <div className="sticky bottom-24 mt-6">
          <Card className="rounded-[28px] border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  프로필 저장
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  저장하면 이후 제안과 알람 품질이 이 정보 기준으로 정렬됩니다.
                </div>
                {saveError && (
                  <div className="mt-2 text-xs text-rose-600">{saveError}</div>
                )}
                {saveNotice && (
                  <div className="mt-2 text-xs text-emerald-600">{saveNotice}</div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => navigate("/add-alarm")}
                >
                  <span className="inline-flex items-center gap-2">
                    <BellPlus className="h-4 w-4" />
                    알람 페이지로 이동
                  </span>
                </Button>
                <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
                  <span className="inline-flex items-center gap-2">
                    {saving ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {saving ? "저장 중..." : "마이페이지 저장"}
                  </span>
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default MyPage;
