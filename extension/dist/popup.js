const toggle = document.querySelector("#toggle");
const status = document.querySelector("#status-text");
chrome.storage.local.get({ monitoring: true }).then(({ monitoring }) => setMonitoring(monitoring));
toggle.addEventListener("click", async () => {
  const monitoring = toggle.getAttribute("aria-pressed") !== "true";
  await chrome.storage.local.set({ monitoring });
  setMonitoring(monitoring);
});
document.querySelector("#open").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isLocal = tab?.url?.startsWith("http://localhost") || tab?.url?.startsWith("http://127.0.0.1");
  if (isLocal && tab.url.includes("#demo-chat")) {
    await chrome.tabs.sendMessage(tab.id, { type: "POLITE_OPEN" }).catch(() => {});
  } else if (isLocal) {
    await chrome.tabs.update(tab.id, { url: "http://127.0.0.1:5173/#demo-chat" });
  } else {
    await chrome.tabs.create({ url: "http://127.0.0.1:5173/#demo-chat" });
  }
  window.close();
});
document.querySelector("#settings").addEventListener("click", () => {
  chrome.tabs.create({ url: "http://127.0.0.1:5173/#extension" });
  window.close();
});
function setMonitoring(value) {
  toggle.setAttribute("aria-pressed", String(value));
  status.textContent = value ? "Active on supported pages" : "Paused by you";
}
