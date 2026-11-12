// Saylient AI content script — click-to-analyze only.
//
// Rules this script follows:
//  - One check on load: if the page has demo messages, add the floating
//    trigger button. Nothing else happens automatically.
//  - No observer watching the DOM, no auto-scan, no auto-analyze on open or on
//    new messages. The user picks WHICH message to analyze.
//  - Analysis runs only when the user clicks "Analyze message", and only
//    against the real backend API with the stored Bearer token.
//  - Insert into composer is click-only and never auto-sends.
//  - Detected message text is user data: it is only ever inserted via
//    textContent / escapeHtml, never as raw innerHTML.

(function () {
  const GOALS = [
    { value: "set_boundary", label: "Set a boundary" },
    { value: "request_payment", label: "Request payment" },
    { value: "negotiate_deadline", label: "Negotiate deadline" },
    { value: "clarify_requirements", label: "Clarify requirements" },
    { value: "respond_to_criticism", label: "Respond to criticism" },
    { value: "negotiate_budget", label: "Negotiate budget" },
    { value: "resolve_disagreement", label: "Resolve disagreement" },
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

  // Demo messages on the page (read-only snapshot at open time).
  const findMessages = () =>
    [...document.querySelectorAll("[data-demo-message], .demo-message")]
      .map((node) => ({ node, text: node.textContent.trim() }))
      .filter((item) => item.text);

  let panel = null;
  let lastDraft = "";

  function addTrigger() {
    if (!document.body || document.querySelector("#saylient-ai-trigger")) return;
    const trigger = document.createElement("button");
    trigger.id = "saylient-ai-trigger";
    trigger.type = "button";
    trigger.textContent = "✦";
    trigger.title = "Open Saylient AI assistant";
    trigger.addEventListener("click", openPanel);
    document.body.append(trigger);
  }

  // One-time check at document_idle: add the trigger only if demo
  // messages exist on this page.
  function checkOnce() {
    if (findMessages().length > 0) addTrigger();
  }

  function openPanel() {
    if (panel) {
      panel.hidden = false;
      renderMessagePicker();
      return;
    }
    const root = document.createElement("aside");
    root.id = "saylient-ai-panel";

    const head = el("div", "sai-head");
    const title = el("b");
    title.innerHTML = "✦ saylient<span>.ai</span>";
    const closeBtn = el("button", null, "×");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.addEventListener("click", closePanel);
    head.append(title, closeBtn);

    root.append(
      head,
      el("p", "sai-kicker", "MESSAGE ANALYSIS"),
      el("h2", null, "Pick a message to analyze."),
    );

    const picker = el("div", "sai-picker");
    picker.append(el("small", null, "CHOOSE A MESSAGE"));
    const options = el("div", "sai-options");
    options.setAttribute("data-options", "");
    picker.append(options);
    root.append(picker);

    const goalLabel = el("label", "sai-goal-label", "Goal");
    const goalSelect = document.createElement("select");
    goalSelect.setAttribute("data-goal", "");
    for (const goal of GOALS) {
      const option = document.createElement("option");
      option.value = goal.value;
      option.textContent = goal.label;
      goalSelect.append(option);
    }
    goalLabel.append(goalSelect);
    root.append(goalLabel);

    const signinNote = el(
      "p",
      "sai-signin-note",
      "Sign in from the extension popup to analyze."
    );
    signinNote.setAttribute("data-signin-note", "");
    signinNote.hidden = true;
    root.append(signinNote);

    const analyzeBtn = el("button", "sai-analyze", "Analyze message");
    analyzeBtn.type = "button";
    analyzeBtn.setAttribute("data-analyze", "");
    analyzeBtn.addEventListener("click", analyzeSelected);
    root.append(analyzeBtn);

    const progress = el("div", "sai-progress");
    progress.setAttribute("data-progress", "");
    progress.hidden = true;
    progress.append(el("span"));
    root.append(progress);

    const error = el("p", "sai-error");
    error.setAttribute("data-error", "");
    error.hidden = true;
    root.append(error);

    const result = el("div", "sai-result");
    result.setAttribute("data-result", "");
    result.hidden = true;
    root.append(result);

    root.append(
      el(
        "p",
        "sai-note",
        "Analysis runs only when you click Analyze. Nothing is monitored or sent automatically."
      )
    );

    document.body.append(root);
    panel = root;
    renderMessagePicker();
    refreshAuthState();
  }

  function renderMessagePicker() {
    if (!panel) return;
    const container = panel.querySelector("[data-options]");
    container.innerHTML = "";
    const messages = findMessages();
    if (messages.length === 0) {
      container.append(el("p", "sai-empty", "No messages found on this page."));
      return;
    }
    // No radio is pre-checked: the user picks which message to analyze.
    messages.forEach((item, index) => {
      const label = el("label", "sai-option");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "sai-message";
      input.value = String(index);
      const snippet = el(
        "span",
        null,
        item.text.length > 140 ? `${item.text.slice(0, 140)}…` : item.text
      );
      label.append(input, snippet);
      container.append(label);
    });
  }

  async function refreshAuthState() {
    if (!panel) return;
    const { "saylient-token": token } = await chrome.storage.local.get("saylient-token");
    const note = panel.querySelector("[data-signin-note]");
    const button = panel.querySelector("[data-analyze]");
    if (token) {
      note.hidden = true;
      button.hidden = false;
    } else {
      note.hidden = false;
      button.hidden = true;
    }
  }

  async function analyzeSelected() {
    if (!panel) return;
    const errorEl = panel.querySelector("[data-error]");
    const resultEl = panel.querySelector("[data-result]");
    const button = panel.querySelector("[data-analyze]");
    const progress = panel.querySelector("[data-progress]");
    errorEl.hidden = true;
    resultEl.hidden = true;

    const selected = panel.querySelector('input[name="sai-message"]:checked');
    if (!selected) {
      errorEl.textContent = "Choose a message to analyze first.";
      errorEl.hidden = false;
      return;
    }
    const message = findMessages()[Number(selected.value)];
    if (!message) {
      errorEl.textContent = "That message is no longer on the page. Reopen the panel and pick again.";
      errorEl.hidden = false;
      return;
    }
    const goal = panel.querySelector("[data-goal]").value;

    const { "saylient-token": token } = await chrome.storage.local.get("saylient-token");
    if (!token) {
      errorEl.textContent = "Sign in from the extension popup to analyze.";
      errorEl.hidden = false;
      return;
    }

    button.disabled = true;
    button.textContent = "Analyzing…";
    progress.hidden = false;

    let data;
    try {
      const res = await fetch(`${SAYLIENT_API_BASE}/analyses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: message.text,
          conversation_context: [],
          goal,
          context: { power: "unknown", social_distance: "unknown", imposition: "unknown" },
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.detail || errData.message || `Analysis failed (HTTP ${res.status}).`
        );
      }
      data = await res.json();
    } catch (err) {
      errorEl.textContent =
        err instanceof TypeError
          ? "Could not reach the Saylient AI backend. Check your connection and try again."
          : err?.message || "Could not reach the Saylient AI backend.";
      errorEl.hidden = false;
      button.disabled = false;
      button.textContent = "Analyze message";
      progress.hidden = true;
      return;
    }

    button.disabled = false;
    button.textContent = "Analyze message";
    progress.hidden = true;
    renderResult(data);
  }

  function renderResult(data) {
    const resultEl = panel.querySelector("[data-result]");
    resultEl.innerHTML = "";
    lastDraft = typeof data?.draft === "string" ? data.draft : "";

    const pct = (value) =>
      typeof value === "number" ? `${Math.round(value * 100)}%` : "—";
    const confNote = "keyword-match strength (uncalibrated)";

    const chips = el("div", "sai-chips");
    chips.append(
      el("span", null, `Intent · ${data?.intent?.label ?? "unknown"} ${pct(data?.intent?.confidence)}`),
      el("span", null, `Tone · ${data?.tone?.label ?? "unknown"} ${pct(data?.tone?.confidence)}`),
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

    resultEl.append(el("small", null, "STRATEGY"));
    resultEl.append(el("p", "sai-strategy", data?.strategy?.label ?? "Unknown strategy"));
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
      resultEl.append(el("small", "sai-model", `Model: ${data.model_version}`));
    }

    const copyBtn = el("button", "sai-copy", "Copy response");
    copyBtn.type = "button";
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(lastDraft);
      copyBtn.textContent = "Copied";
    });
    const insertBtn = el("button", "sai-insert", "Insert into composer");
    insertBtn.type = "button";
    insertBtn.addEventListener("click", () => insertIntoComposer(lastDraft));
    resultEl.append(copyBtn, insertBtn);

    resultEl.hidden = false;
  }

  function insertIntoComposer(text) {
    const composer = document.querySelector("[data-demo-composer]");
    if (!composer) return;
    // React-controlled textarea: use the native value setter so React
    // picks up the change, then fire an input event. Never auto-sends.
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(composer),
        "value"
      )?.set;
      if (setter) setter.call(composer, text);
      else composer.value = text;
      composer.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      composer.textContent = text;
    }
    composer.focus();
  }

  function closePanel() {
    panel?.remove();
    panel = null;
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel) closePanel();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "SAYLIENT_OPEN") openPanel();
  });

  // Single one-time check. No re-scan.
  checkOnce();
})();
