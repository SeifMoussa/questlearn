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

/**
 * Authenticated requests carry the in-memory access token as a Bearer
 * header (see auth-context.tsx for why it's never persisted) rather
 * than the cookie-based flow used by the auth endpoints themselves.
 * Callers pass their token explicitly since this module has no
 * component state of its own.
 */
function authedRequest<T>(
  accessToken: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  return fetch(`${getApiUrl()}${path}`, {
    method,
    credentials: "include",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then((res) => handleResponse<T>(res));
}

export interface RosterEntry {
  id: string;
  name: string;
  email: string | null;
  addedAt: string;
  removedAt: string | null;
}

export interface SchoolClass {
  id: string;
  name: string;
  joinCode: string;
  joinCodeExpiresAt: string;
  createdAt: string;
  archivedAt: string | null;
  roster: RosterEntry[];
}

export function listClasses(accessToken: string) {
  return authedRequest<SchoolClass[]>(accessToken, "GET", "/classes");
}

export function getClass(accessToken: string, id: string) {
  return authedRequest<SchoolClass>(accessToken, "GET", `/classes/${id}`);
}

export function createClass(accessToken: string, params: { name: string }) {
  return authedRequest<SchoolClass>(accessToken, "POST", "/classes", params);
}

export function updateClass(
  accessToken: string,
  id: string,
  params: { name?: string; archived?: boolean },
) {
  return authedRequest<SchoolClass>(accessToken, "PATCH", `/classes/${id}`, params);
}

export function rotateJoinCode(accessToken: string, id: string) {
  return authedRequest<SchoolClass>(accessToken, "POST", `/classes/${id}/join-code/rotate`);
}

export function addRosterEntry(
  accessToken: string,
  id: string,
  params: { name: string; email?: string },
) {
  return authedRequest<RosterEntry>(accessToken, "POST", `/classes/${id}/roster`, params);
}

export function removeRosterEntry(accessToken: string, id: string, rosterId: string) {
  return authedRequest<{ message: string }>(accessToken, "DELETE", `/classes/${id}/roster/${rosterId}`);
}

export type QuestionType = "single_choice" | "multiple_choice" | "true_false" | "short_text" | "numeric";

export interface QuestionOption {
  id: string;
  text: string;
}

/**
 * `correctAnswer` shape depends on `type` — see apps/api's
 * QuestionVersion schema comment for the full mapping (string for
 * single_choice, string[] for multiple_choice, boolean for
 * true_false, string[] for short_text, {value,tolerance?} for
 * numeric). Left untyped here since the client only needs to pass it
 * through, not interpret it.
 */
export type CorrectAnswer = string | string[] | boolean | { value: number; tolerance?: number };

export interface QuestionPayload {
  type: QuestionType;
  prompt: string;
  points?: number;
  hint?: string;
  explanation?: string;
  options?: QuestionOption[];
  correctAnswer: CorrectAnswer;
}

export interface QuestionVersion {
  id: string;
  versionNumber: number;
  type: QuestionType;
  prompt: string;
  points: number;
  hint: string | null;
  explanation: string | null;
  options: QuestionOption[] | null;
  correctAnswer: CorrectAnswer;
  createdAt: string;
}

export interface QuestionSummary {
  id: string;
  createdAt: string;
  archivedAt: string | null;
  currentVersion: QuestionVersion;
}

export function listQuestions(accessToken: string) {
  return authedRequest<QuestionSummary[]>(accessToken, "GET", "/questions");
}

export function getQuestion(accessToken: string, id: string) {
  return authedRequest<QuestionSummary>(accessToken, "GET", `/questions/${id}`);
}

export function createQuestion(accessToken: string, payload: QuestionPayload) {
  return authedRequest<QuestionSummary>(accessToken, "POST", "/questions", payload);
}

export function updateQuestion(accessToken: string, id: string, payload: QuestionPayload) {
  return authedRequest<QuestionSummary>(accessToken, "PATCH", `/questions/${id}`, payload);
}

export function archiveQuestion(accessToken: string, id: string) {
  return authedRequest<QuestionSummary>(accessToken, "DELETE", `/questions/${id}`);
}
