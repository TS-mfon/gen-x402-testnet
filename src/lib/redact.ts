const sensitiveKeys = new Set(["authorization", "x-api-key", "cookie", "set-cookie", "apiKey", "API_KEY_SECRET"]);

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, sensitiveKeys.has(key) || sensitiveKeys.has(key.toLowerCase()) ? "[REDACTED]" : redactSensitive(nested)]));
}
