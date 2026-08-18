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
  // Present on GET /questions/:id (single-question fetch) only —
  // list/create/update responses don't include it since the edit
  // page is the only place concept tags are shown/edited.
  concepts?: { id: string; conceptId: string; concept: { id: string; name: string } }[];
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
  hintViewed: boolean;
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
  return authedRequest<{ activityQuestionId: string; responseValue: unknown; hintViewed: boolean }>(
    accessToken,
    "PATCH",
    `/attempts/${attemptId}/responses/${activityQuestionId}`,
    { responseValue },
  );
}

/**
 * Marks a question's hint as revealed on an in-progress attempt.
 * Deliberately omits `responseValue` from the body — the API only
 * touches fields actually present in the request, so this never
 * clobbers the learner's already-saved answer.
 */
export function markHintViewed(accessToken: string, attemptId: string, activityQuestionId: string) {
  return authedRequest<{ activityQuestionId: string; responseValue: unknown; hintViewed: boolean }>(
    accessToken,
    "PATCH",
    `/attempts/${attemptId}/responses/${activityQuestionId}`,
    { hintViewed: true },
  );
}

export function submitAttempt(accessToken: string, id: string) {
  return authedRequest<AttemptDetail>(accessToken, "POST", `/attempts/${id}/submit`);
}

// ---------------------------------------------------------------------------
// Mastery (Module 6)
// ---------------------------------------------------------------------------

export interface Concept {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  archivedAt: string | null;
}

export function listConcepts(accessToken: string) {
  return authedRequest<Concept[]>(accessToken, "GET", "/concepts");
}

export function createConcept(accessToken: string, params: { name: string; description?: string }) {
  return authedRequest<Concept>(accessToken, "POST", "/concepts", params);
}

export function archiveConcept(accessToken: string, id: string) {
  return authedRequest<Concept>(accessToken, "DELETE", `/concepts/${id}`);
}

export interface QuestionConceptTag {
  id: string;
  conceptId: string;
  concept: Concept;
}

export function updateQuestionConcepts(accessToken: string, questionId: string, conceptIds: string[]) {
  return authedRequest<QuestionConceptTag[]>(accessToken, "PATCH", `/questions/${questionId}/concepts`, { conceptIds });
}

export type MasteryState = "not_started" | "beginning" | "developing" | "proficient" | "mastered";

export interface ConceptMastery {
  conceptId: string;
  conceptName: string;
  score: number | null;
  state: MasteryState;
}

export function getMyMastery(accessToken: string) {
  return authedRequest<ConceptMastery[]>(accessToken, "GET", "/mastery/me");
}

export interface ClassMasteryLearner {
  learnerId: string;
  learnerName: string;
  concepts: ConceptMastery[];
}

export function getClassMastery(accessToken: string, classId: string) {
  return authedRequest<{ learners: ClassMasteryLearner[] }>(accessToken, "GET", `/classes/${classId}/mastery`);
}

// ---------------------------------------------------------------------------
// Gamification (Module 7)
// ---------------------------------------------------------------------------

export type BadgeType = "quest_starter" | "perfect_score" | "concept_champion" | "persistent_learner" | "rising_star";

export interface EarnedBadge {
  badgeType: BadgeType;
  awardedAt: string;
}

export interface GamificationProfile {
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  badges: EarnedBadge[];
}

export function getGamificationProfile(accessToken: string) {
  return authedRequest<GamificationProfile>(accessToken, "GET", "/gamification/profile");
}

// ---------------------------------------------------------------------------
// Quests (Module 8)
// ---------------------------------------------------------------------------

/** Excludes `not_started` — a step's required threshold is never "not started". */
export type QuestMasteryThreshold = "beginning" | "developing" | "proficient" | "mastered";

export interface QuestStepConfig {
  id: string;
  order: number;
  activityId: string | null;
  activityTitle: string | null;
  requiredConceptId: string | null;
  conceptName: string | null;
  requiredMasteryState: QuestMasteryThreshold | null;
}

export interface QuestDetail {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  archivedAt: string | null;
  steps: QuestStepConfig[];
}

export interface QuestSummary {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  archivedAt: string | null;
  stepCount: number;
}

export interface QuestListRow {
  id: string;
  title: string;
  description: string | null;
  totalSteps: number;
  unlockedStepCount: number;
  complete: boolean;
  xpAwarded: number | null;
}

export interface QuestProgressStep {
  id: string;
  order: number;
  activityId: string | null;
  activityTitle: string | null;
  requiredConceptId: string | null;
  conceptName: string | null;
  requiredMasteryState: QuestMasteryThreshold | null;
  complete: boolean;
  unlocked: boolean;
}

export interface QuestProgress {
  id: string;
  title: string;
  description: string | null;
  complete: boolean;
  xpAwarded: number | null;
  steps: QuestProgressStep[];
}

/** Teacher list — the caller's own quests. Learner callers should use `getMyQuests` instead. */
export function listQuests(accessToken: string) {
  return authedRequest<QuestSummary[]>(accessToken, "GET", "/quests");
}

/** Learner list — every non-archived quest in the tenant, with live progress. */
export function getMyQuests(accessToken: string) {
  return authedRequest<QuestListRow[]>(accessToken, "GET", "/quests");
}

/** Teacher detail — step configuration. Learner callers should use `getQuestProgress` instead. */
export function getQuest(accessToken: string, id: string) {
  return authedRequest<QuestDetail>(accessToken, "GET", `/quests/${id}`);
}

/** Learner detail — live per-step complete/unlocked flags and reward state. */
export function getQuestProgress(accessToken: string, id: string) {
  return authedRequest<QuestProgress>(accessToken, "GET", `/quests/${id}`);
}

export function createQuest(accessToken: string, params: { title: string; description?: string }) {
  return authedRequest<QuestDetail>(accessToken, "POST", "/quests", params);
}

export function updateQuest(accessToken: string, id: string, params: { title: string; description?: string }) {
  return authedRequest<QuestDetail>(accessToken, "PATCH", `/quests/${id}`, params);
}

export function archiveQuest(accessToken: string, id: string) {
  return authedRequest<QuestDetail>(accessToken, "DELETE", `/quests/${id}`);
}

export interface QuestStepGateParams {
  activityId?: string;
  requiredConceptId?: string;
  requiredMasteryState?: QuestMasteryThreshold;
}

export function addQuestStep(accessToken: string, questId: string, params: QuestStepGateParams) {
  return authedRequest<QuestDetail>(accessToken, "POST", `/quests/${questId}/steps`, params);
}

export function updateQuestStep(accessToken: string, questId: string, stepId: string, params: QuestStepGateParams) {
  return authedRequest<QuestDetail>(accessToken, "PATCH", `/quests/${questId}/steps/${stepId}`, params);
}

export function removeQuestStep(accessToken: string, questId: string, stepId: string) {
  return authedRequest<QuestDetail>(accessToken, "DELETE", `/quests/${questId}/steps/${stepId}`);
}

export function reorderQuestSteps(accessToken: string, questId: string, stepIds: string[]) {
  return authedRequest<QuestDetail>(accessToken, "PATCH", `/quests/${questId}/steps/reorder`, { stepIds });
}

// ---------------------------------------------------------------------------
// Reporting (Module 9)
// ---------------------------------------------------------------------------

export interface AssignmentReportRow {
  assignmentId: string;
  title: string;
  dueAt: string;
  assignedCount: number;
  submittedCount: number;
  completionRate: number | null;
  averageScore: number | null;
}

export interface ClassReportMasterySummary {
  conceptId: string;
  conceptName: string;
  beginning: number;
  developing: number;
  proficient: number;
  mastered: number;
}

export interface ClassReportLearnerRow {
  rosterEntryId: string;
  name: string;
  learnerId: string | null;
}

export interface ClassReport {
  classId: string;
  className: string;
  summary: { overallCompletionRate: number | null; overallAverageScore: number | null };
  assignments: AssignmentReportRow[];
  masterySummary: ClassReportMasterySummary[];
  learners: ClassReportLearnerRow[];
}

export function getClassReport(accessToken: string, classId: string) {
  return authedRequest<ClassReport>(accessToken, "GET", `/classes/${classId}/report`);
}

/**
 * Returns the raw CSV text rather than triggering a download directly
 * — the endpoint needs the Bearer token, so a plain `<a href>` can't
 * reach it. Callers build a Blob and a temporary anchor client-side
 * (see `/classes/[id]/report/page.tsx`).
 */
export async function getClassReportCsv(accessToken: string, classId: string): Promise<string> {
  const res = await fetch(`${getApiUrl()}/classes/${classId}/report/csv`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new ApiError("Could not download the CSV export.", res.status);
  }
  return res.text();
}

export interface ActivityReportQuestion {
  activityQuestionId: string;
  order: number;
  prompt: string;
  type: QuestionType;
  points: number;
  submittedResponseCount: number;
  correctCount: number;
  correctRate: number | null;
  averagePointsAwarded: number | null;
  hintViewedCount: number;
  hintViewRate: number | null;
}

export interface ActivityReport {
  activityId: string;
  title: string;
  status: ActivityStatus;
  questions: ActivityReportQuestion[];
}

export function getActivityReport(accessToken: string, activityId: string) {
  return authedRequest<ActivityReport>(accessToken, "GET", `/activities/${activityId}/report`);
}

export interface LearnerReportAttempt {
  assignmentId: string;
  activityTitle: string;
  className: string;
  dueAt: string;
  status: AssignmentStatus;
  score: number | null;
  submittedAt: string | null;
}

export interface LearnerReport {
  learner: { id: string; name: string; email: string };
  attempts: LearnerReportAttempt[];
  mastery: ConceptMastery[];
  gamification: GamificationProfile;
  quests: QuestListRow[];
}

export function getLearnerReport(accessToken: string, classId: string, learnerId: string) {
  return authedRequest<LearnerReport>(accessToken, "GET", `/classes/${classId}/learners/${learnerId}/report`);
}
