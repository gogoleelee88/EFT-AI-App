export interface GmailThreadItem {
  id: string | null;
  thread_id: string | null;
  snippet: string | null;
  subject: string | null;
  from: string | null;
  to: string | null;
  date: string | null;
  body_text?: string | null;
  body_html?: string | null;
}

export interface GmailThreadsResponse {
  contact_id: string;
  contact_email: string;
  threads: GmailThreadItem[];
}

export interface GmailSummaryResponse {
  contact_id: string;
  contact_email: string;
  summary: string;
  recent_subjects: string[];
}

export interface GmailMessageDetailResponse {
  contact_id: string;
  contact_email: string;
  message: GmailThreadItem;
}
