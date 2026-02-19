/**
 * Session Storage Service
 * Privacy-first local storage for meditation sessions
 *
 * ⚠️ CONTRACT SIGNATURES - DO NOT CHANGE:
 * - saveSession(summary: SessionSummary): void
 * - loadSessions(): SessionSummary[]
 */

/**
 * Session summary data structure
 */
export interface SessionSummary {
  id: string;
  startTime: number; // Unix timestamp
  endTime: number;
  durationSec: number;
  qualityScore: number; // 0-100
  avgTension: number; // 0-1
  avgBreathRate: number; // breaths per minute
  avgHeartRate?: number; // BPM (optional, from rPPG)
  coachingEvents: {
    level: "GREEN" | "YELLOW" | "RED";
    timestamp: number;
    actions: string[];
  }[];
  selected_video_id?: string;
  notes?: string;
}

/**
 * Weekly report aggregation
 */
export interface WeeklyReport {
  weekStart: number; // Unix timestamp
  weekEnd: number;
  sessions: SessionSummary[];
  avgQualityScore: number;
  totalDuration: number;
  totalSessions: number;
  trends: {
    qualityImprovement: number; // Percentage change
    tensionReduction: number;
    breathRateImprovement: number;
  };
}

const STORAGE_KEY = "meditation_sessions";
const MAX_SESSIONS = 100; // Keep last 100 sessions

/**
 * ⚠️ CONTRACT FUNCTION - SIGNATURE MUST NOT CHANGE
 *
 * Save meditation session to local storage
 */
export function saveSession(summary: SessionSummary): void {
  try {
    const sessions = loadSessions();

    // Add new session
    sessions.unshift(summary); // Most recent first

    // Trim to max sessions
    if (sessions.length > MAX_SESSIONS) {
      sessions.splice(MAX_SESSIONS);
    }

    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));

    console.log(`✅ Session saved: ${summary.id}, duration: ${summary.durationSec}s, quality: ${summary.qualityScore}`);
  } catch (error) {
    console.error("Failed to save session:", error);
  }
}

/**
 * ⚠️ CONTRACT FUNCTION - SIGNATURE MUST NOT CHANGE
 *
 * Load all meditation sessions from local storage
 */
export function loadSessions(): SessionSummary[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];

    const sessions = JSON.parse(data) as SessionSummary[];
    return Array.isArray(sessions) ? sessions : [];
  } catch (error) {
    console.error("Failed to load sessions:", error);
    return [];
  }
}

/**
 * Get sessions for a specific date range
 */
export function getSessionsInRange(
  startTime: number,
  endTime: number
): SessionSummary[] {
  const sessions = loadSessions();
  return sessions.filter(
    (s) => s.startTime >= startTime && s.startTime <= endTime
  );
}

/**
 * Get weekly report for the last 7 days
 */
export function getWeeklyReport(): WeeklyReport {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const sessions = getSessionsInRange(weekAgo, now);

  if (sessions.length === 0) {
    return {
      weekStart: weekAgo,
      weekEnd: now,
      sessions: [],
      avgQualityScore: 0,
      totalDuration: 0,
      totalSessions: 0,
      trends: {
        qualityImprovement: 0,
        tensionReduction: 0,
        breathRateImprovement: 0,
      },
    };
  }

  // Calculate averages
  const avgQualityScore = sessions.reduce((sum, s) => sum + s.qualityScore, 0) / sessions.length;
  const totalDuration = sessions.reduce((sum, s) => sum + s.durationSec, 0);

  // Calculate trends (compare first half vs second half of week)
  const midWeek = weekAgo + 3.5 * 24 * 60 * 60 * 1000;
  const firstHalf = sessions.filter((s) => s.startTime < midWeek);
  const secondHalf = sessions.filter((s) => s.startTime >= midWeek);

  const trends = calculateTrends(firstHalf, secondHalf);

  return {
    weekStart: weekAgo,
    weekEnd: now,
    sessions,
    avgQualityScore,
    totalDuration,
    totalSessions: sessions.length,
    trends,
  };
}

/**
 * Calculate trend improvements
 */
function calculateTrends(
  firstHalf: SessionSummary[],
  secondHalf: SessionSummary[]
) {
  if (firstHalf.length === 0 || secondHalf.length === 0) {
    return {
      qualityImprovement: 0,
      tensionReduction: 0,
      breathRateImprovement: 0,
    };
  }

  const firstQuality = firstHalf.reduce((sum, s) => sum + s.qualityScore, 0) / firstHalf.length;
  const secondQuality = secondHalf.reduce((sum, s) => sum + s.qualityScore, 0) / secondHalf.length;

  const firstTension = firstHalf.reduce((sum, s) => sum + s.avgTension, 0) / firstHalf.length;
  const secondTension = secondHalf.reduce((sum, s) => sum + s.avgTension, 0) / secondHalf.length;

  const firstBreath = firstHalf.reduce((sum, s) => sum + s.avgBreathRate, 0) / firstHalf.length;
  const secondBreath = secondHalf.reduce((sum, s) => sum + s.avgBreathRate, 0) / secondHalf.length;

  return {
    qualityImprovement: ((secondQuality - firstQuality) / firstQuality) * 100,
    tensionReduction: ((firstTension - secondTension) / firstTension) * 100,
    breathRateImprovement: ((secondBreath - firstBreath) / firstBreath) * 100,
  };
}

/**
 * Delete a specific session
 */
export function deleteSession(sessionId: string): boolean {
  try {
    const sessions = loadSessions();
    const filtered = sessions.filter((s) => s.id !== sessionId);

    if (filtered.length === sessions.length) {
      return false; // Session not found
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error("Failed to delete session:", error);
    return false;
  }
}

/**
 * Clear all sessions (for testing or user request)
 */
export function clearAllSessions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log("✅ All sessions cleared");
  } catch (error) {
    console.error("Failed to clear sessions:", error);
  }
}

/**
 * Export sessions as JSON (for user data portability)
 */
export function exportSessions(): string {
  const sessions = loadSessions();
  return JSON.stringify(sessions, null, 2);
}

/**
 * Import sessions from JSON
 */
export function importSessions(jsonData: string): boolean {
  try {
    const sessions = JSON.parse(jsonData) as SessionSummary[];

    if (!Array.isArray(sessions)) {
      throw new Error("Invalid session data format");
    }

    // Validate session structure
    for (const session of sessions) {
      if (!session.id || typeof session.durationSec !== "number") {
        throw new Error("Invalid session structure");
      }
    }

    // Merge with existing sessions
    const existing = loadSessions();
    const merged = [...sessions, ...existing];

    // Remove duplicates by ID
    const unique = Array.from(
      new Map(merged.map((s) => [s.id, s])).values()
    );

    // Sort by start time (most recent first)
    unique.sort((a, b) => b.startTime - a.startTime);

    // Save
    localStorage.setItem(STORAGE_KEY, JSON.stringify(unique.slice(0, MAX_SESSIONS)));

    console.log(`✅ Imported ${sessions.length} sessions`);
    return true;
  } catch (error) {
    console.error("Failed to import sessions:", error);
    return false;
  }
}
