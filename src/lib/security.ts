const blockedHosts = new Set(["localhost", "0.0.0.0", "127.0.0.1", "::1", "169.254.169.254"]);

export function assertSafeRemoteUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Unsupported URL protocol");
  const host = url.hostname.toLowerCase();
  if (blockedHosts.has(host) || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Private hosts are not allowed");
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) throw new Error("Private network addresses are not allowed");
  if (url.username || url.password) throw new Error("Credential-bearing URLs are not allowed");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Unsupported URL port");
  return url;
}

export async function safeFetch(urlValue: string, init: RequestInit = {}, timeoutMs = 12_000) {
  const url = assertSafeRemoteUrl(urlValue);
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "user-agent": "x402-intelligence-gateway/0.1", ...init.headers }
  });
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 2_000_000) throw new Error("Provider response exceeds size limit");
  return response;
}
