import { getApiUrl } from "./health";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
}

export interface Session {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

/**
 * Thrown for any non-2xx API response. `fieldErrors` is populated for
 * validation failures (see apps/api's shared ValidationPipe) so forms
 * can show per-field messages instead of one generic banner.
 */
export class ApiError extends Error {
  status: number;
  fieldErrors?: Record<string, string[]>;

  constructor(message: string, status: number, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) {
    return (await res.json()) as T;
  }

  let body: { message?: string | string[]; fieldErrors?: Record<string, string[]> } = {};
  try {
    body = await res.json();
  } catch {
    // Non-JSON error body; fall through to the generic message below.
  }

  const message = Array.isArray(body.message)
    ? body.message.join(" ")
    : (body.message ?? "Something went wrong. Please try again.");

  throw new ApiError(message, res.status, body.fieldErrors);
}

function jsonRequest<T>(
  path: string,
  body: unknown,
  options: { withCsrf?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.withCsrf) {
    const csrf = readCookie("csrf_token");
    if (csrf) headers["x-csrf-token"] = csrf;
  }

  return fetch(`${getApiUrl()}${path}`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(body),
  }).then((res) => handleResponse<T>(res));
}

export function register(params: { email: string; password: string; name: string }) {
  return jsonRequest<{ message: string }>("/auth/register", params);
}

export function login(params: { email: string; password: string }) {
  return jsonRequest<Session>("/auth/login", params);
}

export function verifyEmail(token: string) {
  return jsonRequest<{ message: string }>("/auth/verify-email", { token });
}

export function forgotPassword(email: string) {
  return jsonRequest<{ message: string }>("/auth/forgot-password", { email });
}

export function resetPassword(params: { token: string; password: string }) {
  return jsonRequest<{ message: string }>("/auth/reset-password", params);
}

export function refresh() {
  return jsonRequest<Session>("/auth/refresh", {}, { withCsrf: true });
}

export function logout() {
  return jsonRequest<{ message: string }>("/auth/logout", {}, { withCsrf: true });
}
