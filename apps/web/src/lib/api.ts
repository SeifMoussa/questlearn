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

export type ActivityStatus = "draft" | "published";

export interface ActivitySummary {
  id: string;
  title: string;
  status: ActivityStatus;
  publishedAt: string | null;
  createdAt: string;
  archivedAt: string | null;
  questionCount: number;
}

/**
 * Resolved question content already reflects the pin-vs-live rule
 * server-side (see apps/api's ActivitiesService.resolveContent) —
 * the client never needs to know whether a row is pinned to render
 * it, only `pinned` for the occasional "locked" UI hint.
 */
export interface ActivityQuestionContent {
  activityQuestionId: string;
  questionId: string;
  order: number;
  pinned: boolean;
  type: QuestionType;
  prompt: string;
  points: number;
  hint: string | null;
  explanation: string | null;
  options: QuestionOption[] | null;
  correctAnswer: CorrectAnswer;
}

export interface ActivityDetail {
  id: string;
  title: string;
  status: ActivityStatus;
  publishedAt: string | null;
  createdAt: string;
  archivedAt: string | null;
  questions: ActivityQuestionContent[];
}

export function listActivities(accessToken: string) {
  return authedRequest<ActivitySummary[]>(accessToken, "GET", "/activities");
}

export function getActivity(accessToken: string, id: string) {
  return authedRequest<ActivityDetail>(accessToken, "GET", `/activities/${id}`);
}

export function createActivity(accessToken: string, params: { title: string }) {
  return authedRequest<ActivitySummary>(accessToken, "POST", "/activities", params);
}

export function renameActivity(accessToken: string, id: string, params: { title: string }) {
  return authedRequest<ActivityDetail>(accessToken, "PATCH", `/activities/${id}`, params);
}

export function addActivityQuestion(accessToken: string, id: string, questionId: string) {
  return authedRequest<ActivityDetail>(accessToken, "POST", `/activities/${id}/questions`, { questionId });
}

export function removeActivityQuestion(accessToken: string, id: string, activityQuestionId: string) {
  return authedRequest<ActivityDetail>(accessToken, "DELETE", `/activities/${id}/questions/${activityQuestionId}`);
}

export function reorderActivityQuestions(accessToken: string, id: string, activityQuestionIds: string[]) {
  return authedRequest<ActivityDetail>(accessToken, "PATCH", `/activities/${id}/questions/reorder`, {
    activityQuestionIds,
  });
}

export function publishActivity(accessToken: string, id: string) {
  return authedRequest<ActivityDetail>(accessToken, "POST", `/activities/${id}/publish`);
}

export function archiveActivity(accessToken: string, id: string) {
  return authedRequest<ActivityDetail>(accessToken, "DELETE", `/activities/${id}`);
}

/**
 * Join-code redemption is the one endpoint in this file that doesn't
 * take an access token as its first argument — it's callable with no
 * session at all (see apps/api's JoinController). When an
 * already-authenticated learner is joining a second class, pass their
 * token so the server can skip account creation and just link the
 * existing account; omit it (or pass undefined) for a brand-new
 * learner, in which case `name`/`email`/`password` are required.
 */
export interface JoinClassResult {
  accessToken?: string;
  expiresIn?: number;
  user?: AuthUser;
  class: { id: string; name: string };
  rosterEntry: { id: string; name: string };
}

export function joinClass(
  params: { joinCode: string; name?: string; email?: string; password?: string },
  accessToken?: string,
): Promise<JoinClassResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  return fetch(`${getApiUrl()}/classes/join`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(params),
  }).then((res) => handleResponse<JoinClassResult>(res));
}

export type AssignmentStatus = "in_progress" | "submitted";

export interface AssignmentSummary {
  id: string;
  dueAt: string;
  createdAt: string;
  archivedAt: string | null;
  classId: string;
  activityId: string;
  class: { id: string; name: string };
  activity: { id: string; title: string; status: ActivityStatus };
}

export function listAssignments(accessToken: string, filter: { classId?: string; activityId?: string } = {}) {
  const params = new URLSearchParams();
  if (filter.classId) params.set("classId", filter.classId);
  if (filter.activityId) params.set("activityId", filter.activityId);
  const query = params.toString();
  return authedRequest<AssignmentSummary[]>(accessToken, "GET", `/assignments${query ? `?${query}` : ""}`);
}

export interface LearnerAssignment {
  id: string;
  dueAt: string;
  createdAt: string;
  classId: string;
  activityId: string;
  class: { id: string; name: string };
  activity: { id: string; title: string; status: ActivityStatus };
  attempt: { id: string; status: AssignmentStatus; score: number | null } | null;
}

export function listMyAssignments(accessToken: string) {
  return authedRequest<LearnerAssignment[]>(accessToken, "GET", "/assignments/mine");
}

export function getAssignment(accessToken: string, id: string) {
  return authedRequest<AssignmentSummary>(accessToken, "GET", `/assignments/${id}`);
}

export function createAssignment(
  accessToken: string,
  params: { classId: string; activityId: string; dueAt: string },
) {
  return authedRequest<AssignmentSummary>(accessToken, "POST", "/assignments", params);
}

export function updateAssignment(accessToken: string, id: string, params: { dueAt: string }) {
  return authedRequest<AssignmentSummary>(accessToken, "PATCH", `/assignments/${id}`, params);
}

/**
 * `correctAnswer`/`isCorrect`/`pointsAwarded` are only present once
 * `status === "submitted"` — the server strips them before then (the
 * answer-key protection boundary), so they're typed optional here
 * rather than always-present.
 */
export interface AttemptQuestion {
  activityQuestionId: string;
  questionId: string;
  order: number;
  type: QuestionType;
  prompt: string;
  points: number;
  hint: string | null;
  explanation: string | null;
  options: QuestionOption[] | null;
  responseValue: unknown;
  correctAnswer?: CorrectAnswer;
  isCorrect?: boolean | null;
  pointsAwarded?: number | null;
}

export interface AttemptDetail {
  id: string;
  assignmentId: string;
  status: AssignmentStatus;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  questions: AttemptQuestion[];
}

export function startAttempt(accessToken: string, assignmentId: string) {
  return authedRequest<AttemptDetail>(accessToken, "POST", `/assignments/${assignmentId}/attempts/start`);
}

export function getAttempt(accessToken: string, id: string) {
  return authedRequest<AttemptDetail>(accessToken, "GET", `/attempts/${id}`);
}

export function autosaveResponse(accessToken: string, attemptId: string, activityQuestionId: string, responseValue: unknown) {
  return authedRequest<{ activityQuestionId: string; responseValue: unknown }>(
    accessToken,
    "PATCH",
    `/attempts/${attemptId}/responses/${activityQuestionId}`,
    { responseValue },
  );
}

export function submitAttempt(accessToken: string, id: string) {
  return authedRequest<AttemptDetail>(accessToken, "POST", `/attempts/${id}/submit`);
}
