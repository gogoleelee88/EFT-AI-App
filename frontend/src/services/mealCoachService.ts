import { apiFetch } from "./http";

export type MealState = "FASTING" | "ATE";
export type TrackType = "AUTO" | "A" | "B";
export type SlotType = "T30" | "T90";

export interface MealCreateInput {
  meal_state: MealState;
  meal_time?: string;
  fasting_hours?: number;
  source?: string;
}

export interface MealCreateOutput {
  meal_id: string;
  meal_state: MealState;
  meal_time: string;
  fasting_hours?: number | null;
  source: string;
  check_windows?: {
    t30_due_at: string;
    t90_due_at: string;
  } | null;
  status: string;
}

export interface MealListItem {
  meal_id: string;
  meal_state: MealState;
  meal_time: string;
  source: string;
  track_selected?: string | null;
  photo_count: number;
  has_estimate: boolean;
  has_post_check: boolean;
}

export interface MealListOutput {
  items: MealListItem[];
}

export interface MealEstimateInput {
  track: TrackType;
  barcode?: string;
  force_recompute?: boolean;
}

export interface MealEstimateOutput {
  estimate_id: string;
  track_used: "A" | "B";
  nutrition: {
    calories: number;
    carbs_g: number;
    protein_g: number;
    fat_g: number;
    sodium_mg: number;
  };
  labels: string[];
  confidence: number;
  confidence_bucket: "low" | "med" | "high";
  uncertainty_reason: string[];
  source_refs: string[];
  versions: {
    engine_version: string;
    model_version: string;
    prompt_version: string;
    dataset_version: string;
  };
}

export interface MealPhotoUploadOutput {
  uploaded: { photo_id: string; url: string }[];
  raw_store: boolean;
  auto_estimate?: MealEstimateOutput | null;
}

export interface PostCheckInput {
  slot: SlotType;
  sleepiness: number;
  focus_drop: number;
  sluggishness: number;
  gi_discomfort?: number | null;
  headache?: number | null;
  caffeine_used?: boolean;
  submitted_at?: string;
  notification_opened_at?: string;
}

export interface PostCheckOutput {
  check_id: string;
  slot: SlotType;
  dip_score_partial: number;
  late: boolean;
  check_completion_time_ms?: number | null;
}

export interface AdviceOutput {
  advice_id: string;
  dip_score: number;
  decision_mode: string;
  task_mode: string;
  next_action: string[];
  confidence: number;
  why_tokens: string[];
  versions: {
    engine_version: string;
    model_version: string;
    prompt_version: string;
    dataset_version: string;
  };
}

export interface WeeklySummaryOutput {
  week_start: string;
  days_logged: number;
  avg_dip_score: number;
  t30_response_rate: number;
  advice_follow_rate: number;
  zero_input_meal_rate: number;
}

function randomId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function authHeaders(userId?: string, idempotencyKey?: string, includeJsonContentType = true): Headers {
  const h = new Headers();
  if (includeJsonContentType) {
    h.set("Content-Type", "application/json; charset=utf-8");
  }
  const tenantId = (localStorage.getItem("TENANT_ID") || userId || "").trim();
  if (tenantId) {
    h.set("X-Tenant-Id", tenantId);
  }
  if (idempotencyKey) {
    h.set("Idempotency-Key", idempotencyKey);
  }
  return h;
}

export async function createMeal(
  input: MealCreateInput,
  userId?: string
): Promise<MealCreateOutput> {
  const key = randomId("MEAL");
  return apiFetch<MealCreateOutput>("/api/v1/meals", {
    method: "POST",
    credentials: "include",
    headers: authHeaders(userId, key),
    body: JSON.stringify(input),
  });
}

export async function uploadMealPhotoRefs(
  mealId: string,
  uris: string[],
  userId?: string
): Promise<MealPhotoUploadOutput> {
  const key = randomId("PHOTO");
  const photos = uris
    .map((uri) => uri.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((uri) => ({
      storage_uri: uri,
      raw_store: false,
    }));

  return apiFetch<MealPhotoUploadOutput>(
    `/api/v1/meals/${mealId}/photos`,
    {
      method: "POST",
      credentials: "include",
      headers: authHeaders(userId, key),
      body: JSON.stringify({ photos }),
    }
  );
}

export async function uploadMealPhotos(
  mealId: string,
  files: File[],
  userId?: string
): Promise<MealPhotoUploadOutput> {
  const filtered = files.slice(0, 10);
  if (filtered.length === 0) {
    throw new Error("최소 1개 사진 파일이 필요합니다.");
  }

  const key = randomId("PHOTO-UPLOAD");
  const formData = new FormData();
  for (const file of filtered) {
    formData.append("files", file, file.name);
  }
  formData.append("raw_store", "false");

  const res = await fetch(`/api/v1/meals/${mealId}/photos/upload`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders(userId, key, false),
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} :: ${text}`);
  }
  return (await res.json()) as MealPhotoUploadOutput;
}

export async function estimateMeal(
  mealId: string,
  input: MealEstimateInput,
  userId?: string
): Promise<MealEstimateOutput> {
  const key = randomId("EST");
  return apiFetch<MealEstimateOutput>(`/api/v1/meals/${mealId}/estimate`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders(userId, key),
    body: JSON.stringify(input),
  });
}

export async function submitPostCheck(
  mealId: string,
  input: PostCheckInput,
  userId?: string
): Promise<PostCheckOutput> {
  const key = randomId(`PC-${input.slot}`);
  return apiFetch<PostCheckOutput>(`/api/v1/meals/${mealId}/post-check`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders(userId, key),
    body: JSON.stringify(input),
  });
}

export async function listMeals(
  userId?: string,
  options?: { limit?: number; meal_state?: MealState }
): Promise<MealListOutput> {
  const headers = authHeaders(userId);
  const params = new URLSearchParams();
  if (options?.limit) {
    params.set("limit", String(options.limit));
  }
  if (options?.meal_state) {
    params.set("meal_state", options.meal_state);
  }
  const q = params.toString();
  return apiFetch<MealListOutput>(`/api/v1/meals${q ? `?${q}` : ""}`, {
    method: "GET",
    credentials: "include",
    headers,
  });
}

export async function getAdvice(mealId: string, userId?: string): Promise<AdviceOutput> {
  const headers = authHeaders(userId);
  return apiFetch<AdviceOutput>(`/api/v1/meals/${mealId}/advice`, {
    method: "GET",
    credentials: "include",
    headers,
  });
}

export async function getWeeklySummary(userId?: string): Promise<WeeklySummaryOutput> {
  const headers = authHeaders(userId);
  return apiFetch<WeeklySummaryOutput>("/api/v1/summaries/weekly", {
    method: "GET",
    credentials: "include",
    headers,
  });
}
