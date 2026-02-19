export type GuideMode = "dom" | "screenshot";
export type TargetType = "selector" | "bbox" | "text_hint";

export type BBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Candidate = {
  label: string;
  selector?: string | null;
  bbox?: BBox | null;
  confidence: number;
};

export type StepTarget = {
  type: TargetType;
  selector?: string | null;
  text_hint?: string | null;
  bbox?: BBox | null;
};

export type StepFallback = {
  type: "bbox";
  bbox?: BBox | null;
};

export type StepConfirm = {
  needed: boolean;
  question?: string | null;
};

export type Step = {
  id: string;
  title: string;
  instruction: string;
  target: StepTarget;
  fallback: StepFallback;
  confirm: StepConfirm;
  candidates: Candidate[];
};

export type StepPlan = {
  mode: GuideMode;
  goal: string;
  step_index: number;
  total_steps_hint: number;
  steps: Step[];
};

export type DomNode = {
  id: string;
  text: string;
  role?: string;
  ariaLabel?: string;
  tag?: string;
  classes?: string[];
  pathHint?: string;
};

export type DomPlanRequest = {
  goal: string;
  url: string;
  dom_summary: DomNode[];
  locale: "ko-KR";
  context_text?: string;
  step_index: number;
  max_steps: number;
};

export type ScreenshotPlanRequest = {
  goal: string;
  screenshot_base64: string;
  locale: "ko-KR";
  context_text?: string;
  step_index: number;
  max_steps: number;
};

export type DomPlanResponse = {
  step_plan: StepPlan;
};

export type ScreenshotPlanResponse = {
  step_plan: StepPlan;
  annotated_image_base64?: string | null;
  img_w: number;
  img_h: number;
};

export type WorkGuideConfirmLogRequest = {
  goal: string;
  mode: GuideMode;
  step_id: string;
  confirm_needed: boolean;
  confirm_answer?: "yes" | "no";
  selected_candidate_index?: number;
};

