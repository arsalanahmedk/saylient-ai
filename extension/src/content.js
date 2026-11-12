(function () {
  const state = { monitoring: true, seen: new Set(), panel: null, lastText: "" };
  const selectors = ["[data-demo-message]", ".demo-message", "[data-message]"];
  const findMessages = () => selectors.flatMap(selector => [...document.querySelectorAll(selector)])
    .map(node => ({ node, text: node.textContent.trim() })).filter(item => item.text);
  const latestMessage = () => findMessages().at(-1)?.text || "";
  const scan = () => {
    if (!state.monitoring) return;
    for (const item of findMessages()) {
      const key = `${item.node.dataset.messageId || ""}:${item.text}`;
      if (!state.seen.has(key)) state.seen.add(key);
    }
    const latest = latestMessage();
    if (state.seen.size && !document.querySelector("#saylient-ai-trigger")) addTrigger();
    if (state.panel && latest && latest !== state.lastText) {
      state.lastText = latest;
      updatePanel(latest);
      autoAnalyze();
    }
  };
  const addTrigger = () => {
    if (!document.body || document.querySelector("#saylient-ai-trigger")) return;
    const trigger = document.createElement("button");
    trigger.id = "saylient-ai-trigger"; trigger.type = "button"; trigger.textContent = "✦";
    trigger.title = "Open Saylient AI assistant"; trigger.addEventListener("click", openPanel);
    document.body.append(trigger);
  };
  const openPanel = () => {
    if (state.panel) { state.panel.hidden = false; return; }
    const root = document.createElement("aside"); root.id = "saylient-ai-panel";
    root.innerHTML = `<div class="sai-head"><b>✦ saylient<span>.ai</span></b><button data-close>×</button></div>
      <p class="sai-kicker">LIVE DEMO ANALYSIS <span class="sai-live">● watching</span></p><h2>Make your next message clearer.</h2>
      <div class="sai-context"><small>DETECTED CONVERSATION</small><p data-context>${escapeHtml(latestMessage() || "No message selected")}</p></div>
      <button class="sai-analyze">Analyze message</button><div class="sai-progress" hidden><span></span></div><div class="sai-result" hidden>
      <div class="sai-chips"><span>Intent · Follow up</span><span>FTA · Mild pressure</span></div>
      <small>SUGGESTED RESPONSE</small><p>Hi Alex, I wanted to check in on the final files. Would it be possible to share them today? Let me know if anything is blocking the last steps.</p>
      <button class="sai-copy">Copy response</button><button class="sai-insert">Insert into composer</button></div>`;
    document.body.append(root); state.panel = root;
    state.lastText = latestMessage();
    root.querySelector("[data-close]").onclick = closePanel;
    root.querySelector(".sai-analyze").onclick = autoAnalyze;
    root.querySelector(".sai-copy").onclick = async () => { await navigator.clipboard.writeText(root.querySelector(".sai-result p").textContent); root.querySelector(".sai-copy").textContent = "Copied"; };
    root.querySelector(".sai-insert").onclick = () => { const composer = document.querySelector("[data-demo-composer]"); if (composer) { composer.value = root.querySelector(".sai-result p").textContent; composer.focus(); } };
    autoAnalyze();
  };
  const updatePanel = text => { if (!state.panel) return; state.panel.querySelector("[data-context]").textContent = text; state.panel.querySelector(".sai-result").hidden = true; state.panel.querySelector(".sai-analyze").hidden = false; state.panel.querySelector(".sai-analyze").textContent = "Analyze message"; };
  const autoAnalyze = () => {
    if (!state.panel || state.panel.dataset.analyzing === "true") return;
    state.panel.dataset.analyzing = "true";
    const button = state.panel.querySelector(".sai-analyze");
    const progress = state.panel.querySelector(".sai-progress");
    button.textContent = "Analyzing conversation…"; button.disabled = true; progress.hidden = false;
    setTimeout(() => { button.hidden = true; button.disabled = false; progress.hidden = true; state.panel.querySelector(".sai-result").hidden = false; state.panel.dataset.analyzing = "false"; }, 650);
  };
  const closePanel = () => { state.panel?.remove(); state.panel = null; };
  const escapeHtml = text => text.replace(/[&<>"']/g, char => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" })[char]);
  chrome.storage.local.get({ monitoring: true }).then(({ monitoring }) => { state.monitoring = monitoring; scan(); });
  chrome.storage.onChanged.addListener(changes => { if (changes.monitoring) state.monitoring = changes.monitoring.newValue; });
  chrome.runtime.onMessage.addListener(message => { if (message.type === "SAYLIENT_OPEN") openPanel(); });
  if (document.documentElement) new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
})();
