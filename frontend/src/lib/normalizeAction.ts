export type Action = { type: string; payload?: any };

const TYPE_ALIASES: Record<string, string> = {
  start_eftar: "start_eftar",
  startEFTAR: "start_eftar",
  eft_start: "start_eftar",
  eftar_start: "start_eftar",
  begin_eft: "start_eftar",
};

const PICK = (obj: any, keys: string[], def?: any) => {
  for (const k of keys) if (obj && k in obj) return obj[k];
  return def;
};

export function normalizeAction(a: Action): Action {
  if (!a || typeof a !== "object") return a;
  const t = TYPE_ALIASES[a.type] ?? a.type;
  if (t !== "start_eftar") return a;
  const p = a.payload ?? {};
  const script = PICK(p, ["script", "template", "flow", "preset", "program", "scene"], "standard_relief");
  const suds = PICK(p, ["suds", "sudsScore", "score", "intensity"], undefined);
  const route = PICK(p, ["route", "path", "redirect", "url"], "/eftar");
  const params = PICK(p, ["params", "extra", "meta"], undefined);
  const payload: any = { script, route, action_version: "v1" };
  if (suds != null && !Number.isNaN(Number(suds))) payload.suds = Number(suds);
  if (params) payload.params = params;
  return { type: "start_eftar", payload };
}
