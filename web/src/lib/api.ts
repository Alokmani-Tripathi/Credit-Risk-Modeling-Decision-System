export type ApiConfig = {
  baseUrl: string;
};

export function apiConfig(): ApiConfig | null {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  return baseUrl ? { baseUrl } : null;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = apiConfig();
  if (!config) throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const response = await fetch(`${config.baseUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`API ${response.status}: ${detail || response.statusText}`);
  }
  return response.json() as Promise<T>;
}