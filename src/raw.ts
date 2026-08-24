export function serializeRawJson(value: unknown): string {
  try { return JSON.stringify(value, null, 2) ?? '' } catch { return String(value) }
}
