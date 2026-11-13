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
