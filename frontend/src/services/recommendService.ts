import type { StrictIntakeInput } from '../types/serverAI';
import type { YouTubeCandidate } from '../types/meditation';

export type DurationBucket = 5 | 10 | 20 | 30;

export interface YouTubeRecommendRequest {
  intake: StrictIntakeInput;
  selected_theme_id: string;
  preferred_duration_bucket: DurationBucket;
}

export interface YouTubeRecommendResponse {
  candidates: YouTubeCandidate[];
}

const YOUTUBE_RECOMMEND = '/api/recommend/youtube_meditations';

export async function recommendYouTubeMeditations(
  req: YouTubeRecommendRequest
): Promise<YouTubeRecommendResponse> {
  const res = await fetch(YOUTUBE_RECOMMEND, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`YouTube recommend failed: ${res.status} ${err}`);
  }
  return res.json();
}
