// Saylient AI extension service worker.
//
// Clicking the toolbar icon opens the Saylient AI hero page. The in-page
// panel (content.js) does the analysis, and only ever runs when the user
// clicks Analyze. Nothing watches the page, nothing auto-scans, and nothing
// auto-sends. Auth state lives in chrome.storage.local.

// config.js is a classic script holding the build-time origins.
importScripts("config.js");

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: SAYLIENT_APP_ORIGIN });
});

const MENU_ID = "saylient-analyze-selection";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Analyze with Saylient AI",
    contexts: ["selection"],
  });
});

async function openPanelInTab(tabId, text) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "SAYLIENT_OPEN", text });
  } catch {
    // The content script is not loaded in this tab yet (for example the
    // page was open before the extension was installed): inject it first,
    // then deliver the message.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["config.js", "content.js"],
    });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
    await chrome.tabs.sendMessage(tabId, { type: "SAYLIENT_OPEN", text });
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  openPanelInTab(tab.id, info.selectionText || "");
});

// --- API proxy: content scripts must not call the backend directly -------
// A content script's fetch() carries the PAGE's Origin, and the backend's
// CORS allow-list only permits its own app origin, so the preflight fails
// on every other site ("Could not reach the Saylient AI backend"). The
// service worker fetches from the extension origin instead: host_permissions
// cover the API origin, so no CORS applies here.
const API_TIMEOUT_MS = 90_000;
const API_ORIGIN = new URL(SAYLIENT_API_BASE).origin;

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function wakeBackend() {
  // Render Free spins down when idle; a GET /health wakes it (~50s).
  // Best effort: the retry below reports the real outcome.
  try {
    await fetchWithTimeout(`${API_ORIGIN}/health`, { method: "GET" });
  } catch {
    // Fall through to the retry.
  }
}

async function callApi(path, method, body, token, tabId) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = { method, headers };
  if (body !== undefined && body !== null) init.body = JSON.stringify(body);
  const url = `${SAYLIENT_API_BASE}${path}`;
  const attempt = async () => {
    const res = await fetchWithTimeout(url, init);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  };
  try {
    return await attempt();
  } catch {
    // Network failure (usually a cold Render instance): tell the panel to
    // show "Starting server…", warm the backend up, then retry once.
    if (tabId !== undefined) {
      chrome.tabs.sendMessage(tabId, { type: "SAYLIENT_WARMING_UP" }).catch(() => {});
    }
    await wakeBackend();
    return await attempt();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "SAYLIENT_API") return;
  callApi(message.path, message.method, message.body, message.token, sender?.tab?.id)
    .then((result) => sendResponse(result))
    .catch((err) =>
      sendResponse({
        ok: false,
        status: 0,
        data: {},
        error:
          err?.name === "AbortError"
            ? "The request timed out. Check your connection and try again."
            : "Could not reach the Saylient AI backend.",
      })
    );
  return true; // keep the message channel open for the async response
});
