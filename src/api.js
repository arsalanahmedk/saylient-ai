/* Central API client for the Saylient AI backend (FastAPI, /api/v1).
   See freelancer_communication_assistant_docs/06-api/API_SPEC.md and
   07-engineering/FRONTEND_GUIDE.md: a single client, timeouts, safe error
   handling, and no passwords or provider keys stored anywhere.

   Sessions are HttpOnly cookies (``saylient_session``) set by the API on
   register/login — the browser stores them and sends them automatically
   (``credentials: "include"``), so JavaScript never sees the session
   token and nothing is kept in localStorage. The API also accepts a
   Bearer token (used by the browser extension), but this client never
   sends one. Set VITE_API_URL in a root .env file to point at another
   API host. */

const API_BASE = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Friendly one-line message for the UI. Never leaks raw server internals. */
export function friendlyError(error) {
  if (error instanceof ApiError) {
    if (error.code === "NETWORK") return error.message;
    if (error.code === "TIMEOUT") return error.message;
    if (error.status === 401) return "Your session expired or the email/password was wrong. Please sign in again.";
    if (error.status === 403) return "That request was blocked. Please sign in again and try once more.";
    if (error.status === 404) return "That item was not found (or it belongs to another account).";
    if (error.status === 409) return "That already exists. Try a different name.";
    if (error.status === 413) return "That was too large. Please send a shorter message.";
    if (error.status === 422) return "Please check the fields and try again.";
    if (error.status === 429) return "Too many requests — please wait a moment and try again.";
    return error.message || "Something went wrong. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

async function request(path, { method = "GET", body, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include", // send the HttpOnly session cookie
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === "AbortError") {
      throw new ApiError(0, "TIMEOUT", "The request timed out. Check that the Saylient AI backend is running.");
    }
    throw new ApiError(0, "NETWORK", "Could not reach the Saylient AI backend. Start it first: cd backend && uvicorn app.main:app --port 8000");
  }
  clearTimeout(timer);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!res.ok) {
    const err = data && data.error ? data.error : {};
    throw new ApiError(res.status, err.code || "REQUEST_FAILED", err.message || `Request failed (${res.status}).`);
  }
  return data;
}

export const GOAL_VALUES = {
  "Set a boundary": "set_boundary",
  "Request payment": "request_payment",
  "Negotiate deadline": "negotiate_deadline",
  "Clarify requirements": "clarify_requirements",
  "Respond to criticism": "respond_to_criticism",
  "Negotiate budget": "negotiate_budget",
  "Resolve disagreement": "resolve_disagreement",
};
export const GOAL_LABELS = Object.fromEntries(Object.entries(GOAL_VALUES).map(([label, value]) => [value, label]));

export const TONE_OPTIONS = ["Professional", "Friendly", "Diplomatic", "Assertive", "Empathetic"];
export const DIRECTNESS_OPTIONS = [
  { value: "direct", label: "Direct" },
  { value: "balanced", label: "Balanced" },
  { value: "gentle", label: "Gentle" },
];

/** "set_boundary" -> "Set boundary"; "negative_politeness" -> "Negative politeness". */
export function prettyLabel(value) {
  if (!value) return "Unknown";
  return String(value).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/** Confidence is uncalibrated keyword-match strength — label it honestly wherever numbers are shown. */
export const CONFIDENCE_NOTE = "keyword-match strength (uncalibrated)";

export const api = {
  register: (email, password, display_name) => request("/auth/register", { method: "POST", body: { email, password, display_name } }),
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  logout: () => request("/auth/logout", { method: "POST", body: {} }),
  me: () => request("/auth/me"),
  patchMe: (payload) => request("/auth/me", { method: "PATCH", body: payload }),
  forgotPassword: (email) => request("/auth/forgot-password", { method: "POST", body: { email } }),
  resetPassword: (token, new_password) => request("/auth/reset-password", { method: "POST", body: { token, new_password } }),
  createAnalysis: (payload) => request("/analyses", { method: "POST", body: payload }),
  listAnalyses: (limit = 50, offset = 0) => request(`/analyses?limit=${limit}&offset=${offset}`),
  getAnalysis: (id) => request(`/analyses/${id}`),
  getStats: () => request("/analyses/stats"),
  regenerateAnalysis: (id, payload) => request(`/analyses/${id}/regenerate`, { method: "POST", body: payload || {} }),
  deleteAnalysis: (id) => request(`/analyses/${id}`, { method: "DELETE" }),
  listDrafts: (analysisId) => request(`/analyses/${analysisId}/drafts`),
  createDraft: (analysisId, payload) => request(`/analyses/${analysisId}/drafts`, { method: "POST", body: payload }),
  patchDraft: (id, payload) => request(`/drafts/${id}`, { method: "PATCH", body: payload }),
  deleteDraft: (id) => request(`/drafts/${id}`, { method: "DELETE" }),
  listTemplates: (limit = 50, offset = 0) => request(`/templates?limit=${limit}&offset=${offset}`),
  createTemplate: (payload) => request("/templates", { method: "POST", body: payload }),
  patchTemplate: (id, payload) => request(`/templates/${id}`, { method: "PATCH", body: payload }),
  deleteTemplate: (id) => request(`/templates/${id}`, { method: "DELETE" }),
  exportData: () => request("/privacy/export"),
  deleteAccount: (password) => request("/privacy/delete-account", { method: "POST", body: { password } }),
};
