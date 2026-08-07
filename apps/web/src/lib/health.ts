export type DependencyStatus = "connected" | "disconnected";

export interface HealthReport {
  web: "running";
  api: "connected";
  database: DependencyStatus;
  redis: DependencyStatus;
  environment: string;
  timestamp: string;
}

const DEFAULT_API_URL = "http://localhost:4000";

export function getApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL;
}

/**
 * Calls the API's /health endpoint. Left to throw on network failure
 * or a non-2xx response so the caller can render a real degraded
 * state instead of silently pretending everything is fine.
 */
export async function fetchHealth(): Promise<HealthReport> {
  const response = await fetch(`${getApiUrl()}/health`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }

  return (await response.json()) as HealthReport;
}
