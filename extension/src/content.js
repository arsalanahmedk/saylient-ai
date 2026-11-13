// Saylient AI content script — screen analysis, click-to-analyze only.
//
// Rules this script follows:
//  - The floating logo button is always present on the page. Nothing is read
//    from the page until the user opens the panel.
//  - Text is collected only when the panel opens (or when the user picks
//    "Analyze with Saylient AI" from the context menu): the current text
//    selection first, otherwise the page's main readable text, capped at
//    2000 characters. The collected text is shown verbatim in the textarea
//    with a character count, and the user can edit it before anything is sent.
//  - No observer watching the DOM, no auto-scan, no auto-analyze. Analysis
//    runs only when the user clicks "Analyze", and only against the real
//    backend API with the stored Bearer token.
//  - All backend calls go through the background service worker
//    (chrome.runtime.sendMessage → apiCall): a content script's fetch()
//    carries the PAGE's Origin, which the backend's CORS allow-list rejects
//    on every site except the app itself, so direct calls fail with a
//    TypeError. The worker fetches from the extension origin instead.
//  - Insert into a field is click-only and never auto-sends.
//  - Page text is user data: it is only ever inserted via textContent /
//    escapeHtml, never as raw innerHTML.

(function () {
  const MAX_CHARS = 2000;
  const GOALS = [
    { value: "set_boundary", label: "Set a boundary" },
    { value: "request_payment", label: "Request payment" },
    { value: "negotiate_deadline", label: "Negotiate deadline" },
    { value: "clarify_requirements", label: "Clarify requirements" },
    { value: "respond_to_criticism", label: "Respond to criticism" },
    { value: "negotiate_budget", label: "Negotiate budget" },
    { value: "resolve_disagreement", label: "Resolve disagreement" },
  ];
  const TONE_OPTIONS = ["Professional", "Friendly", "Diplomatic", "Assertive", "Empathetic"];
  const DIRECTNESS_OPTIONS = [
    { value: "direct", label: "Direct" },
    { value: "balanced", label: "Balanced" },
    { value: "gentle", label: "Gentle" },
  ];

  const escapeHtml = (text) =>
    String(text).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[char]);

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };

  /* Password strength, same 5 rules as the website: length + character
     variety. A higher score means harder to guess — never unbreakable. */
  const EYE_SVG = "<svg viewBox=\"0 0 24 24\" width=\"17\" height=\"17\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/></svg>";
  const EYE_OFF_SVG = "<svg viewBox=\"0 0 24 24\" width=\"17\" height=\"17\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9.88 9.88a3 3 0 1 0 4.24 4.24\"/><path d=\"M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68\"/><path d=\"M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61\"/><line x1=\"2\" y1=\"2\" x2=\"22\" y2=\"22\"/></svg>";
  const PW_RULES = [
    { label: "8+ characters", test: (pw) => pw.length >= 8 },
    { label: "A capital letter", test: (pw) => /[A-Z]/.test(pw) },
    { label: "A small letter", test: (pw) => /[a-z]/.test(pw) },
    { label: "A number", test: (pw) => /[0-9]/.test(pw) },
    { label: "A symbol", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
  ];
  const passwordStrength = (pw) => {
    if (!pw) return { passed: 0, level: 0, label: "" };
    const passed = PW_RULES.filter((r) => r.test(pw)).length;
    const level = passed <= 2 ? 1 : passed === 3 ? 2 : passed === 4 ? 3 : 4;
    return { passed, level, label: ["", "Weak", "Fair", "Good", "Strong"][level] };
  };
  /* Eye button that shows/hides a password field. Returns a wrapper span
     holding the input + button, so the input keeps its field styling. */
  const wrapPasswordInput = (input) => {
    const wrap = el("span", "sai-pw-wrap");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sai-pw-toggle";
    btn.innerHTML = EYE_SVG;
    btn.setAttribute("aria-label", "Show password");
    btn.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.innerHTML = show ? EYE_OFF_SVG : EYE_SVG;
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
    wrap.append(input, btn);
    return wrap;
  };

  const prettyLabel = (value) =>
    value
      ? String(value).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "Unknown";

  // --- text collection: runs only when the panel opens -------------------
  // Selected text wins. Otherwise the page's main readable text: the long
  // blocks of the main/article region (whole page as a fallback), in reading
  // order, capped at MAX_CHARS.
  function collectFrom(scope) {
    if (!scope) return "";
    const nodes = scope.querySelectorAll("p, li, blockquote, td, h1, h2, h3");
    const seen = new Set();
    const parts = [];
    let length = 0;
    for (const node of nodes) {
      const text = node.textContent.trim().replace(/\s+/g, " ");
      if (text.length < 40 || seen.has(text)) continue;
      // Skip a block already covered by a longer block collected earlier.
      if (parts.some((part) => part.includes(text))) continue;
      seen.add(text);
      if (length + text.length + 2 > MAX_CHARS) break;
      parts.push(text);
      length += text.length + 2;
    }
    return parts.join("\n\n");
  }

  function collectPageText() {
    const selection = window.getSelection?.()?.toString().trim();
    if (selection) return selection.slice(0, MAX_CHARS);
    const main = collectFrom(document.querySelector("main, article"));
    if (main) return main;
    return collectFrom(document.body);
  }

  // --- state --------------------------------------------------------------
  let panel = null;
  let lastDraft = "";
  let currentAnalysisId = null;
  let lastFocusedEditable = null;

  const isEditable = (node) =>
    node instanceof HTMLElement &&
    (node instanceof HTMLTextAreaElement ||
      node instanceof HTMLInputElement ||
      node.isContentEditable);

  // Remember which field the user was typing in, so Insert knows where to
  // go. This only records the element reference — it never reads page content.
  document.addEventListener("focusin", (event) => {
    if (isEditable(event.target)) lastFocusedEditable = event.target;
  });

  function addTrigger() {
    if (!document.body || document.querySelector("#saylient-ai-trigger")) return;
    const trigger = document.createElement("button");
    trigger.id = "saylient-ai-trigger";
    trigger.type = "button";
    // The Saylient logo (icon.svg ships in the extension package and is
    // listed in web_accessible_resources, so the image loads on any page).
    const triggerLogo = document.createElement("img");
    triggerLogo.src = chrome.runtime.getURL("icon.svg");
    triggerLogo.alt = "Saylient AI";
    trigger.append(triggerLogo);
    trigger.title = "Open Saylient AI assistant";
    trigger.addEventListener("click", () => openPanel());
    document.body.append(trigger);
  }

  // --- panel ---------------------------------------------------------------
  function openPanel(prefillText) {
    if (panel) {
      panel.hidden = false;
      if (typeof prefillText === "string" && prefillText.trim()) {
        setMessageText(prefillText);
      } else {
        refreshDetectedTextIfEmpty();
      }
      refreshAuthState();
      return;
    }

    const root = document.createElement("aside");
    root.id = "saylient-ai-panel";

    const head = el("div", "sai-head");
    const title = el("b");
    title.innerHTML = `<img class="sai-title-logo" src="${chrome.runtime.getURL("icon.svg")}" alt=""> saylient<span>.ai</span>`;
    const closeBtn = el("button", null, "×");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.addEventListener("click", closePanel);
    head.append(title, closeBtn);
    root.append(head);

    root.append(el("p", "sai-kicker", "MESSAGE ANALYSIS"));
    root.append(el("h2", null, "Analyze what's on your screen."));

    // Sign-in view (shown when signed out).
    const auth = el("section", "sai-auth");
    auth.setAttribute("data-auth", "");
    auth.append(el("p", "sai-auth-lede", "Sign in with your Saylient AI account to analyze. The token stays in this browser only."));
    const signinForm = el("form", "sai-signin-form");
    signinForm.setAttribute("data-signin-form", "");
    const emailLabel = el("label", "sai-field-label", "Email");
    const emailInput = document.createElement("input");
    emailInput.type = "email";
    emailInput.required = true;
    emailInput.autocomplete = "email";
    emailInput.placeholder = "you@example.com";
    emailInput.setAttribute("data-email", "");
    emailLabel.append(emailInput);
    const passwordLabel = el("label", "sai-field-label", "Password");
    const passwordInput = document.createElement("input");
    passwordInput.type = "password";
    passwordInput.required = true;
    passwordInput.autocomplete = "current-password";
    passwordInput.placeholder = "Your password";
    passwordInput.setAttribute("data-password", "");
    passwordLabel.append(wrapPasswordInput(passwordInput));
    const signinError = el("p", "sai-error");
    signinError.setAttribute("data-signin-error", "");
    signinError.hidden = true;
    const signinSubmit = el("button", "sai-primary", "Sign in");
    signinSubmit.type = "submit";
    signinSubmit.setAttribute("data-signin-submit", "");
    signinForm.append(emailLabel, passwordLabel, signinError, signinSubmit);
    signinForm.addEventListener("submit", signIn);

    // Create-account view (hidden until the user asks for it). Many users
    // have no account on the live backend yet, so sign-in alone is a dead
    // end for them.
    const registerToggle = el("button", "sai-toggle", "No account yet? Create one");
    registerToggle.type = "button";
    registerToggle.setAttribute("data-show-register", "");
    const registerForm = el("form", "sai-signin-form");
    registerForm.setAttribute("data-register-form", "");
    registerForm.hidden = true;
    const nameLabel = el("label", "sai-field-label", "Display name");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.autocomplete = "name";
    nameInput.placeholder = "Your name";
    nameInput.setAttribute("data-display-name", "");
    nameLabel.append(nameInput);
    const regEmailLabel = el("label", "sai-field-label", "Email");
    const regEmailInput = document.createElement("input");
    regEmailInput.type = "email";
    regEmailInput.required = true;
    regEmailInput.autocomplete = "email";
    regEmailInput.placeholder = "you@example.com";
    regEmailInput.setAttribute("data-register-email", "");
    regEmailLabel.append(regEmailInput);
    const regPasswordLabel = el("label", "sai-field-label", "Password");
    const regPasswordInput = document.createElement("input");
    regPasswordInput.type = "password";
    regPasswordInput.required = true;
    regPasswordInput.autocomplete = "new-password";
    regPasswordInput.placeholder = "At least 8 characters";
    regPasswordInput.minLength = 8;
    regPasswordInput.setAttribute("data-register-password", "");
    regPasswordLabel.append(wrapPasswordInput(regPasswordInput));
    /* Live strength meter for the new password: coloured bar + label +
       the five rules, updated on every keystroke. Guidance only — the
       backend still only requires 8+ characters. */
    const meter = el("div", "sai-pw-meter");
    meter.hidden = true;
    const meterBar = el("div", "sai-pw-bar");
    const meterFill = document.createElement("i");
    meterBar.append(meterFill);
    const meterLabel = el("p", "sai-pw-label", "");
    const meterRules = el("ul", "sai-pw-rules");
    PW_RULES.forEach((r) => meterRules.append(el("li", "", r.label)));
    meter.append(meterBar, meterLabel, meterRules);
    regPasswordInput.addEventListener("input", () => {
      const pw = regPasswordInput.value;
      const s = passwordStrength(pw);
      meter.hidden = pw.length === 0;
      meter.setAttribute("data-level", String(s.level));
      meterFill.style.width = `${s.level * 25}%`;
      meterLabel.textContent = `${s.label} password — ${s.passed} of ${PW_RULES.length} rules met`;
      [...meterRules.children].forEach((li, i) => li.classList.toggle("ok", PW_RULES[i].test(pw)));
    });
    const registerError = el("p", "sai-error");
    registerError.setAttribute("data-register-error", "");
    registerError.hidden = true;
    const registerSubmit = el("button", "sai-primary", "Create account");
    registerSubmit.type = "submit";
    registerSubmit.setAttribute("data-register-submit", "");
    registerForm.append(nameLabel, regEmailLabel, regPasswordLabel, meter, registerError, registerSubmit);
    registerForm.addEventListener("submit", registerAccount);
    const backToggle = el("button", "sai-toggle", "Already have an account? Sign in");
    backToggle.type = "button";
    backToggle.setAttribute("data-show-signin", "");
    backToggle.hidden = true;
    registerToggle.addEventListener("click", () => {
      signinForm.hidden = true;
      registerToggle.hidden = true;
      registerForm.hidden = false;
      backToggle.hidden = false;
    });
    backToggle.addEventListener("click", () => {
      registerForm.hidden = true;
      backToggle.hidden = true;
      signinForm.hidden = false;
      registerToggle.hidden = false;
    });
    auth.append(signinForm, registerToggle, registerForm, backToggle);
    root.append(auth);

    // Signed-in account row.
    const account = el("div", "sai-account");
    account.setAttribute("data-account", "");
    account.hidden = true;
    const accountEmail = el("b");
    accountEmail.setAttribute("data-account-email", "");
    const signoutBtn = el("button", "sai-signout", "Sign out");
    signoutBtn.type = "button";
    signoutBtn.setAttribute("data-signout", "");
    signoutBtn.addEventListener("click", signOut);
    account.append(accountEmail, signoutBtn);
    root.append(account);

    // Compose view (shown when signed in).
    const compose = el("div", "sai-compose");
    compose.setAttribute("data-compose", "");
    compose.hidden = true;

    const messageLabel = el("label", "sai-field-label", "Text to analyze");
    const messageInput = document.createElement("textarea");
    messageInput.className = "sai-textarea";
    messageInput.rows = 5;
    messageInput.maxLength = MAX_CHARS;
    messageInput.placeholder = "Select text on the page, or paste a message here.";
    messageInput.setAttribute("data-message", "");
    messageInput.addEventListener("input", updateCount);
    messageLabel.append(messageInput);
    compose.append(messageLabel);

    const count = el("p", "sai-count");
    count.setAttribute("data-count", "");
    compose.append(count);

    const goalLabel = el("label", "sai-field-label", "Goal");
    const goalSelect = document.createElement("select");
    goalSelect.setAttribute("data-goal", "");
    for (const goal of GOALS) {
      const option = document.createElement("option");
      option.value = goal.value;
      option.textContent = goal.label;
      goalSelect.append(option);
    }
    goalLabel.append(goalSelect);
    compose.append(goalLabel);

    const toneRow = el("div", "sai-tone-row");
    const toneLabel = el("label", "sai-field-label", "Tone");
    const toneSelect = document.createElement("select");
    toneSelect.setAttribute("data-tone", "");
    for (const tone of TONE_OPTIONS) {
      const option = document.createElement("option");
      option.value = tone;
      option.textContent = tone;
      if (tone === "Diplomatic") option.selected = true;
      toneSelect.append(option);
    }
    toneLabel.append(toneSelect);
    const directnessLabel = el("label", "sai-field-label", "Directness");
    const directnessSelect = document.createElement("select");
    directnessSelect.setAttribute("data-directness", "");
    for (const directness of DIRECTNESS_OPTIONS) {
      const option = document.createElement("option");
      option.value = directness.value;
      option.textContent = directness.label;
      if (directness.value === "balanced") option.selected = true;
      directnessSelect.append(option);
    }
    directnessLabel.append(directnessSelect);
    toneRow.append(toneLabel, directnessLabel);
    compose.append(toneRow);

    const analyzeBtn = el("button", "sai-analyze", "Analyze");
    analyzeBtn.type = "button";
    analyzeBtn.setAttribute("data-analyze", "");
    analyzeBtn.addEventListener("click", analyze);
    compose.append(analyzeBtn);

    const progress = el("div", "sai-progress");
    progress.setAttribute("data-progress", "");
    progress.hidden = true;
    progress.append(el("span"));
    compose.append(progress);

    const error = el("p", "sai-error");
    error.setAttribute("data-error", "");
    error.hidden = true;
    compose.append(error);

    const result = el("div", "sai-result");
    result.setAttribute("data-result", "");
    result.hidden = true;
    compose.append(result);

    root.append(compose);

    root.append(
      el(
        "p",
        "sai-note",
        "Analysis runs only when you click Analyze. Nothing is monitored or sent automatically. Suggestions come from the Saylient AI backend analysis (rule-based prototype v0.1) — review before you send."
      )
    );

    document.body.append(root);
    panel = root;
    refreshDetectedTextIfEmpty();
    refreshAuthState();
  }

  function setMessageText(text) {
    if (!panel) return;
    const input = panel.querySelector("[data-message]");
    input.value = String(text).slice(0, MAX_CHARS);
    updateCount();
  }

  function refreshDetectedTextIfEmpty() {
    if (!panel) return;
    const input = panel.querySelector("[data-message]");
    if (input.value.trim()) return;
    setMessageText(collectPageText());
  }

  function updateCount() {
    if (!panel) return;
    const input = panel.querySelector("[data-message]");
    const count = panel.querySelector("[data-count]");
    count.textContent = `${input.value.length} / ${MAX_CHARS} characters · sent exactly as shown`;
  }

  async function refreshAuthState() {
    if (!panel) return;
    const { "saylient-token": token, "saylient-email": email } =
      await chrome.storage.local.get(["saylient-token", "saylient-email"]);
    const auth = panel.querySelector("[data-auth]");
    const account = panel.querySelector("[data-account]");
    const compose = panel.querySelector("[data-compose]");
    if (token) {
      auth.hidden = true;
      account.hidden = false;
      compose.hidden = false;
      panel.querySelector("[data-account-email]").textContent = email || "Signed in";
    } else {
      auth.hidden = false;
      account.hidden = true;
      compose.hidden = true;
    }
  }

  // --- backend calls (via the background service worker) ---------------
  function apiErrorFrom(result) {
    if (!result || result.status === 0) {
      return new Error(
        result?.error || "Could not reach the Saylient AI backend. Check your connection and try again."
      );
    }
    const message =
      result.data?.error?.message || result.data?.detail || result.data?.message;
    const err = new Error(message || `Request failed (HTTP ${result.status}).`);
    err.status = result.status;
    return err;
  }

  async function apiCall(path, method, body, token) {
    const result = await chrome.runtime.sendMessage({
      type: "SAYLIENT_API",
      path,
      method,
      body,
      token,
    });
    if (!result || !result.ok) throw apiErrorFrom(result);
    return result.data;
  }

  // The worker tells the panel when it is warming the backend up (Render
  // Free spins down when idle), so the active button says "Starting
  // server…" instead of flashing an error while the user waits.
  function showWarmingUp() {
    if (!panel) return;
    const button =
      panel.querySelector("[data-signin-submit]:disabled") ||
      panel.querySelector("[data-register-submit]:disabled") ||
      panel.querySelector("[data-analyze]:disabled");
    if (button) button.textContent = "Starting server…";
  }

  async function signIn(event) {
    event.preventDefault();
    if (!panel) return;
    const email = panel.querySelector("[data-email]").value.trim();
    const password = panel.querySelector("[data-password]").value;
    const errorEl = panel.querySelector("[data-signin-error]");
    const submit = panel.querySelector("[data-signin-submit]");
    errorEl.hidden = true;
    submit.disabled = true;
    submit.textContent = "Signing in…";
    try {
      const data = await apiCall("/auth/login", "POST", { email, password });
      await chrome.storage.local.set({ "saylient-token": data.token, "saylient-email": email });
      refreshAuthState();
    } catch (err) {
      errorEl.textContent =
        err.status === 401 || err.status === 400
          ? "Wrong email or password — or create an account below."
          : err.message || "Sign-in failed.";
      errorEl.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = "Sign in";
    }
  }

  async function registerAccount(event) {
    event.preventDefault();
    if (!panel) return;
    const email = panel.querySelector("[data-register-email]").value.trim();
    const password = panel.querySelector("[data-register-password]").value;
    const displayName = panel.querySelector("[data-display-name]").value.trim();
    const errorEl = panel.querySelector("[data-register-error]");
    const submit = panel.querySelector("[data-register-submit]");
    errorEl.hidden = true;
    submit.disabled = true;
    submit.textContent = "Creating account…";
    try {
      const data = await apiCall("/auth/register", "POST", {
        email,
        password,
        display_name: displayName,
      });
      await chrome.storage.local.set({ "saylient-token": data.token, "saylient-email": email });
      refreshAuthState();
    } catch (err) {
      errorEl.textContent =
        err.status === 409
          ? "An account with this email already exists — try signing in instead."
          : err.message || "Could not create the account.";
      errorEl.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = "Create account";
    }
  }

  async function signOut() {
    await chrome.storage.local.remove(["saylient-token", "saylient-email"]);
    refreshAuthState();
  }

  function apiErrorMessage(err) {
    return err?.message || "Could not reach the Saylient AI backend.";
  }

  async function analyze() {
    if (!panel) return;
    const errorEl = panel.querySelector("[data-error]");
    const resultEl = panel.querySelector("[data-result]");
    const button = panel.querySelector("[data-analyze]");
    const progress = panel.querySelector("[data-progress]");
    errorEl.hidden = true;
    resultEl.hidden = true;

    const message = panel.querySelector("[data-message]").value.trim();
    if (!message) {
      errorEl.textContent = "Add or select some text to analyze first.";
      errorEl.hidden = false;
      return;
    }
    const goal = panel.querySelector("[data-goal]").value;
    const tone = panel.querySelector("[data-tone]").value;
    const directness = panel.querySelector("[data-directness]").value;

    const { "saylient-token": token } = await chrome.storage.local.get("saylient-token");
    if (!token) {
      errorEl.textContent = "Sign in above to analyze.";
      errorEl.hidden = false;
      return;
    }

    button.disabled = true;
    button.textContent = "Analyzing…";
    progress.hidden = false;

    let data;
    try {
      data = await apiCall(
        "/analyses",
        "POST",
        {
          message,
          conversation_context: [],
          goal,
          context: { power: "unknown", social_distance: "unknown", imposition: "unknown" },
          tone,
          directness,
        },
        token
      );
    } catch (err) {
      errorEl.textContent = apiErrorMessage(err);
      errorEl.hidden = false;
      button.disabled = false;
      button.textContent = "Analyze";
      progress.hidden = true;
      return;
    }

    button.disabled = false;
    button.textContent = "Analyze";
    progress.hidden = true;
    renderResult(data);
  }

  async function regenerate() {
    if (!panel || !currentAnalysisId) return;
    const errorEl = panel.querySelector("[data-error]");
    const resultEl = panel.querySelector("[data-result]");
    const button = panel.querySelector("[data-regenerate]");
    errorEl.hidden = true;
    const tone = panel.querySelector("[data-tone]").value;
    const directness = panel.querySelector("[data-directness]").value;
    const { "saylient-token": token } = await chrome.storage.local.get("saylient-token");
    if (!token) {
      errorEl.textContent = "Sign in above to analyze.";
      errorEl.hidden = false;
      return;
    }
    button.disabled = true;
    button.textContent = "Regenerating…";
    try {
      renderResult(
        await apiCall(`/analyses/${currentAnalysisId}/regenerate`, "POST", { tone, directness }, token)
      );
    } catch (err) {
      errorEl.textContent = apiErrorMessage(err);
      errorEl.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = "Regenerate with these settings";
    }
  }

  function renderResult(data) {
    const resultEl = panel.querySelector("[data-result]");
    resultEl.innerHTML = "";
    lastDraft = typeof data?.draft === "string" ? data.draft : "";
    currentAnalysisId = typeof data?.id === "string" ? data.id : null;

    const pct = (value) =>
      typeof value === "number" ? `${Math.round(value * 100)}%` : "—";
    const confNote = "keyword-match strength (uncalibrated)";

    const chips = el("div", "sai-chips");
    chips.append(
      el("span", null, `Intent · ${prettyLabel(data?.intent?.label)} ${pct(data?.intent?.confidence)}`),
      el("span", null, `Tone · ${prettyLabel(data?.tone?.label)} ${pct(data?.tone?.confidence)}`),
    );
    resultEl.append(chips);
    resultEl.append(el("small", "sai-conf-note", `Confidence shown is ${confNote}.`));

    resultEl.append(el("small", null, "FACE-THREATENING ACT"));
    resultEl.append(
      el("p", null, data?.fta?.detected ? data.fta.description || "Detected." : "No face-threatening act detected.")
    );

    const concerns = Array.isArray(data?.face_concern) ? data.face_concern : [];
    resultEl.append(el("small", null, "FACE CONCERNS"));
    if (concerns.length > 0) {
      const list = el("ul", "sai-list");
      for (const concern of concerns) list.append(el("li", null, String(concern)));
      resultEl.append(list);
    } else {
      resultEl.append(el("p", null, "None listed."));
    }

    const cf = data?.context_factors || {};
    resultEl.append(el("small", null, "RELATIONSHIP CONTEXT (P / D / R)"));
    resultEl.append(
      el(
        "p",
        null,
        `Power · ${prettyLabel(cf.power)} — Social distance · ${prettyLabel(cf.social_distance)} — Imposition · ${prettyLabel(cf.imposition)}`
      )
    );

    resultEl.append(el("small", null, "STRATEGY"));
    resultEl.append(el("p", "sai-strategy", prettyLabel(data?.strategy?.label)));
    if (data?.strategy?.rationale) resultEl.append(el("p", null, data.strategy.rationale));

    resultEl.append(el("small", null, "SUGGESTED RESPONSE"));
    resultEl.append(el("p", "sai-draft", lastDraft || "No draft returned."));

    const limitations = Array.isArray(data?.limitations) ? data.limitations : [];
    if (limitations.length > 0) {
      resultEl.append(el("small", null, "LIMITATIONS"));
      const list = el("ul", "sai-list");
      for (const item of limitations) list.append(el("li", null, String(item)));
      resultEl.append(list);
    }

    if (data?.model_version) {
      resultEl.append(el("small", "sai-model", `Model: ${data.model_version} (rule-based prototype)`));
    }

    const copyBtn = el("button", "sai-copy", "Copy response");
    copyBtn.type = "button";
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(lastDraft);
      copyBtn.textContent = "Copied";
    });
    const insertBtn = el("button", "sai-insert", "Insert into field");
    insertBtn.type = "button";
    insertBtn.addEventListener("click", () => insertIntoField(lastDraft));
    const regenBtn = el("button", "sai-regenerate", "Regenerate with these settings");
    regenBtn.type = "button";
    regenBtn.setAttribute("data-regenerate", "");
    regenBtn.addEventListener("click", regenerate);
    resultEl.append(copyBtn, insertBtn, regenBtn);

    resultEl.hidden = false;
  }

  function findInsertTarget() {
    if (lastFocusedEditable?.isConnected && isEditable(lastFocusedEditable)) {
      return lastFocusedEditable;
    }
    if (isEditable(document.activeElement)) return document.activeElement;
    const demo = document.querySelector("[data-demo-composer]");
    if (demo) return demo;
    return (
      [...document.querySelectorAll("textarea, input[type='text'], input:not([type]), [contenteditable='true']")].find(
        (node) => node.offsetParent !== null
      ) || null
    );
  }

  function insertIntoField(text) {
    if (!panel) return;
    const errorEl = panel.querySelector("[data-error]");
    const target = findInsertTarget();
    if (!target) {
      errorEl.textContent = "No text field found on this page to insert into. Copy the draft instead.";
      errorEl.hidden = false;
      return;
    }
    // React-controlled field: use the native value setter so React picks up
    // the change, then fire an input event. Never auto-sends.
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), "value")?.set;
      if (setter) setter.call(target, text);
      else target.value = text;
      target.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      target.textContent = text;
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }
    target.focus();
  }

  function closePanel() {
    panel?.remove();
    panel = null;
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel) closePanel();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "SAYLIENT_OPEN") openPanel(message.text);
    if (message?.type === "SAYLIENT_WARMING_UP") showWarmingUp();
  });

  // The trigger is always present. Nothing is read from the page until the
  // user opens the panel.
  addTrigger();
})();
