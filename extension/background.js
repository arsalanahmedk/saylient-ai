// Saylient AI extension service worker.
//
// No background work happens here: nothing watches the page, nothing
// auto-scans, and nothing auto-analyzes. Analysis only runs when the user
// clicks "Analyze message" in the panel, and auth state lives in
// chrome.storage.local.
