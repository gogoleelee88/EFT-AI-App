export type DataQuality = "insufficient" | "fair" | "good";

export interface MenstrualPrediction {
  next_period_window_start: string | null;
  next_period_window_end: string | null;
  confidence_score: number;
  why_this: string;
  data_quality: DataQuality;
  fertility_window_visible: boolean;
  phase_policy: string;
  medical_disclaimer: string;
}

export interface MenstrualDaySummary {
  day_date: string;
  bleeding_status: "none" | "spotting" | "period";
  flow_level: number | null;
  cycle_day_index: number | null;
  phase: "menstruation" | "follicular" | "ovulation_window" | "luteal" | "unknown";
  phase_probabilities: Record<string, number>;
  pmdd_symptom_index: number | null;
  top_symptoms: Array<{ symptom: string; severity: number }>;
}

export interface MenstrualCalendarResponse {
  day_summaries: MenstrualDaySummary[];
  fertility_window_visible: boolean;
  phase_policy: string;
  medical_disclaimer: string;
}

export interface MenstrualExportJob {
  job_id: string;
  status: "pending" | "completed" | "failed";
  created_at: string;
  formats: Array<"csv" | "pdf">;
  medical_disclaimer: string;
}

export interface MenstrualExportStatus {
  job_id: string;
  status: "pending" | "completed" | "failed";
  formats: Array<"csv" | "pdf">;
  ready_files: string[];
  error_message?: string | null;
}

export interface MenstrualInsightsResponse {
  symptom_trends: Array<{ symptom: string; avg_severity: number; sample_count: number }>;
  pmdd_index_timeline: Array<{ date: string; pmdd_symptom_index: number }>;
  worsening_days: string[];
  worsening_threshold_p75: number | null;
  top_triggers_in_worsening_days: Array<{ tag: string; count: number }>;
  trigger_vs_index_timeline: Array<{ date: string; pmdd_symptom_index: number | null; trigger_tags: string[] }>;
  recent_two_week_pattern: string;
  medical_disclaimer: string;
}

export interface MenstrualPrivacySettings {
  on_device_only: boolean;
  fertility_window_mode: "hidden" | "range_only";
  app_lock_enabled: boolean;
  app_lock_method: "faceid" | "touchid" | "pin" | null;
  backup_mode: "local_encrypted" | "e2e_cloud";
  app_lock_recommended: boolean;
  privacy_notice: string;
}

export interface MenstrualRecordResponse {
  recorded?: boolean;
  event_id: string;
  date?: string | null;
  event_date?: string | null;
  timestamp?: string | null;
}

export interface MenstrualPmddLiteScore {
  pmdd_symptom_index: number;
  pms_severity_band: string;
  severity_thresholds?: Record<string, number>;
  baseline_index?: number | null;
  trend_delta?: number | null;
  confidence?: "fair" | "good" | string;
  interpretation?: string;
  scoring_version?: string;
  high_emotional_count?: number;
  answered_items?: number;
  caution?: string;
  medical_disclaimer: string;
}

export interface MenstrualPmddLiteResponse {
  recorded?: boolean;
  event?: MenstrualRecordResponse;
  score: MenstrualPmddLiteScore;
}

export interface JournalEntry {
  event_id: string;
  datetime: string;
  text: string;
  tags: string[];
  severity: number | null;
}

export interface JournalSearchResponse {
  entries: JournalEntry[];
}

type HttpMethod = "GET" | "POST" | "PATCH";

async function request<T>(path: string, method: HttpMethod, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const detail = (data as { detail?: string } | null)?.detail ?? response.statusText;
    throw new Error(detail || `HTTP ${response.status}`);
  }
  return data as T;
}

export async function getMenstrualPrediction(): Promise<MenstrualPrediction> {
  return request<MenstrualPrediction>("/v1/menstrual/prediction", "GET");
}

export async function getMenstrualCalendar(fromDate: string, toDate: string): Promise<MenstrualCalendarResponse> {
  return request<MenstrualCalendarResponse>(
    `/v1/menstrual/calendar?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`,
    "GET"
  );
}

export async function logBleeding(input: {
  date: string;
  type: "menstruation_start" | "menstruation_end" | "spotting_start" | "spotting_end";
  flow_level: number;
  cramp_level?: number | null;
  pain_areas?: string[];
  notes?: string | null;
  meds_taken?: string[];
}): Promise<MenstrualRecordResponse> {
  return request<MenstrualRecordResponse>("/v1/menstrual/bleeding", "POST", input);
}

export async function logSymptoms(input: {
  date: string;
  symptom_severity_map: Record<string, number>;
  notes?: string | null;
  favorite_symptoms?: string[];
}): Promise<MenstrualRecordResponse> {
  return request<MenstrualRecordResponse>("/v1/menstrual/symptoms", "POST", input);
}

export async function logPmddLite(input: {
  date: string;
  answers: number[];
  question_ids?: string[];
  notes?: string | null;
}): Promise<MenstrualPmddLiteResponse> {
  return request<MenstrualPmddLiteResponse>("/v1/menstrual/pmdd-lite", "POST", input);
}

export async function createMenstrualExport(input: {
  from: string;
  to: string;
  formats: Array<"csv" | "pdf">;
  allow_server_export?: boolean;
}): Promise<MenstrualExportJob> {
  return request<MenstrualExportJob>("/v1/menstrual/export", "POST", input);
}

export async function getMenstrualExportStatus(jobId: string): Promise<MenstrualExportStatus> {
  return request<MenstrualExportStatus>(`/v1/menstrual/export/${encodeURIComponent(jobId)}`, "GET");
}

export async function logTrigger(input: {
  date: string;
  tags: Array<
    | "conflict"
    | "overtime"
    | "caffeine"
    | "alcohol"
    | "travel"
    | "sickness"
    | "exercise_change"
    | "sleep_change"
    | "other"
  >;
  stress_level?: number;
  note?: string | null;
}): Promise<MenstrualRecordResponse> {
  return request<MenstrualRecordResponse>("/v1/menstrual/triggers", "POST", input);
}

export async function logMeds(input: {
  datetime: string;
  med_name: string;
  dose?: string | null;
  type: "painkiller" | "contraceptive" | "ssri" | "supplement" | "other";
  effect_rating?: number;
  note?: string | null;
}): Promise<MenstrualRecordResponse> {
  return request<MenstrualRecordResponse>("/v1/menstrual/meds", "POST", input);
}

export async function logJournal(input: {
  datetime: string;
  text: string;
  tags?: string[];
  severity?: number;
}): Promise<MenstrualRecordResponse> {
  return request<MenstrualRecordResponse>("/v1/menstrual/journal", "POST", input);
}

export async function getJournal(input: {
  fromDate?: string;
  toDate?: string;
  tag?: string;
  minSeverity?: number;
  q?: string;
} = {}): Promise<JournalSearchResponse> {
  const params = new URLSearchParams();
  if (input.fromDate) {
    params.set("from", input.fromDate);
  }
  if (input.toDate) {
    params.set("to", input.toDate);
  }
  if (input.tag) {
    params.set("tag", input.tag);
  }
  if (input.minSeverity != null) {
    params.set("minSeverity", String(input.minSeverity));
  }
  if (input.q) {
    params.set("q", input.q);
  }
  const query = params.toString();
  return request<JournalSearchResponse>(`/v1/menstrual/journal${query ? `?${query}` : ""}`, "GET");
}

export async function getMenstrualInsights(fromDate: string, toDate: string): Promise<MenstrualInsightsResponse> {
  return request<MenstrualInsightsResponse>(
    `/v1/menstrual/insights?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`,
    "GET"
  );
}

export async function getMenstrualSettings(): Promise<MenstrualPrivacySettings> {
  return request<MenstrualPrivacySettings>("/v1/menstrual/settings", "GET");
}

export async function updateMenstrualSettings(
  input: Partial<
    Pick<MenstrualPrivacySettings, "on_device_only" | "fertility_window_mode" | "app_lock_enabled" | "app_lock_method" | "backup_mode">
  >
): Promise<MenstrualPrivacySettings> {
  return request<MenstrualPrivacySettings>("/v1/menstrual/settings", "PATCH", input);
}

export function getMenstrualExportDownloadUrl(jobId: string, format: "csv" | "pdf"): string {
  return `/v1/menstrual/export/${encodeURIComponent(jobId)}?format=${format}`;
}
