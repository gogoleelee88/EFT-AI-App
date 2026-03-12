import {
  upsertAspirationProfile,
  upsertCapabilityProfile,
} from "./proposalService";
import type {
  AspirationProfilePayload,
  CapabilityProfilePayload,
} from "../types/proposalOS";

export interface AspirationProfileResponse extends AspirationProfilePayload {
  aspiration_profile_id: number;
}

export interface CapabilityProfileResponse extends CapabilityProfilePayload {
  capability_profile_id: number;
}

async function requestProfile<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { credentials: "include" });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export const getAspirationProfile = (userId: string) =>
  requestProfile<AspirationProfileResponse>(
    `/api/profiles/aspiration/${encodeURIComponent(userId)}`
  );

export const getCapabilityProfile = (userId: string) =>
  requestProfile<CapabilityProfileResponse>(
    `/api/profiles/capability/${encodeURIComponent(userId)}`
  );

export async function saveProfileBundle(args: {
  aspiration: AspirationProfilePayload;
  capability: CapabilityProfilePayload;
}) {
  const [aspiration, capability] = await Promise.all([
    upsertAspirationProfile(args.aspiration),
    upsertCapabilityProfile(args.capability),
  ]);

  return { aspiration, capability };
}
