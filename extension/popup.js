// Saylient AI popup — sign in with the backend, then open the demo workspace.
// The token is stored in chrome.storage.local (key "saylient-token").
// No watch mode: analysis only runs when the user clicks Analyze in the panel.

const signinView = document.querySelector("#signin-view");
const signedinView = document.querySelector("#signedin-view");
const signinForm = document.querySelector("#signin-form");
const signinError = document.querySelector("#signin-error");
const signinSubmit = document.querySelector("#signin-submit");
const userEmailEl = document.querySelector("#user-email");

function showSignedIn(email) {
  signinView.hidden = true;
  signedinView.hidden = false;
  userEmailEl.textContent = email || "Signed in";
}

function showSignIn() {
  signinView.hidden = false;
  signedinView.hidden = true;
}

chrome.storage.local.get(["saylient-token", "saylient-email"]).then(
  ({ "saylient-token": token, "saylient-email": email }) => {
    if (token) showSignedIn(email);
    else showSignIn();
  }
);

signinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  signinError.hidden = true;
  signinSubmit.disabled = true;
  signinSubmit.textContent = "Signing in…";
  try {
    // Route through the background service worker: a popup/content fetch
    // carries the page's Origin, which the backend's CORS allow-list
    // rejects. (This popup is currently unused — no default_popup — but
    // keep it working the same way as the panel.)
    const result = await chrome.runtime.sendMessage({
      type: "SAYLIENT_API",
      path: "/auth/login",
      method: "POST",
      body: { email, password },
    });
    if (!result || !result.ok) {
      const message =
        result?.status === 0
          ? "Could not reach the Saylient AI backend. Check your connection and try again."
          : result?.data?.error?.message ||
            result?.data?.detail ||
            result?.data?.message ||
            `Sign-in failed (${result?.status ?? "?" }).`;
      throw new Error(message);
    }
    const data = result.data;
    await chrome.storage.local.set({ "saylient-token": data.token, "saylient-email": email });
    showSignedIn(email);
  } catch (err) {
    signinError.textContent = err?.message || "Sign-in failed.";
    signinError.hidden = false;
  } finally {
    signinSubmit.disabled = false;
    signinSubmit.textContent = "Sign in";
  }
});

document.querySelector("#signout").addEventListener("click", async () => {
  await chrome.storage.local.remove(["saylient-token", "saylient-email"]);
  showSignIn();
});

document.querySelector("#open").addEventListener("click", async () => {
  const demoUrl = `${SAYLIENT_APP_ORIGIN}/#demo-chat`;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isAppTab = tab?.url?.startsWith(SAYLIENT_APP_ORIGIN);
  if (isAppTab && tab.url.includes("#demo-chat")) {
    await chrome.tabs.sendMessage(tab.id, { type: "SAYLIENT_OPEN" }).catch(() => {});
  } else if (isAppTab) {
    await chrome.tabs.update(tab.id, { url: demoUrl });
  } else {
    await chrome.tabs.create({ url: demoUrl });
  }
  window.close();
});

document.querySelector("#settings").addEventListener("click", () => {
  chrome.tabs.create({ url: `${SAYLIENT_APP_ORIGIN}/#extension` });
  window.close();
});
