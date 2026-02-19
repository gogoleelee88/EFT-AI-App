import type { CoachAnalyzeRequest, CoachAnalyzeResponse } from '@/types/coach';

async function parseError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    return payload?.detail || payload?.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

export async function analyzeCoach(payload: CoachAnalyzeRequest): Promise<CoachAnalyzeResponse> {
  const response = await fetch('/api/coach/analyze', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as CoachAnalyzeResponse;
}

