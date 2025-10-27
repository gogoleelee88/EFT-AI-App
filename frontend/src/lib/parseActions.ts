export type Action = { type: string; payload?: any };

export function parseActions(input: unknown): Action[] {
  const arr = Array.isArray(input) ? input : [];
  const out: Action[] = [];
  for (const it of arr) {
    if (
      it &&
      typeof it === "object" &&
      typeof (it as any).type === "string" &&
      (it as any).type.trim()
    ) {
      const type = (it as any).type.trim();
      const payload = (it as any).payload ?? {};
      out.push({ type, payload });
    } else {
      // eslint-disable-next-line no-console
      console.warn("[actions] dropped invalid action:", it);
    }
  }
  // eslint-disable-next-line no-console
  console.log("[actions] parsed:", out);
  return out;
}
