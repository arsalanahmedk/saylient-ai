# Polite AI browser extension

This is a local-only Manifest V3 demonstration. It detects messages on the project's demo chat page, opens a floating assistant, and inserts a simulated response into the composer. It never sends messages automatically and does not claim integrations with third-party platforms.

## Architecture

- `src/manifest.json` is generated during build.
- `src/content.js` uses a small adapter selector set and `MutationObserver` to detect new demo messages.
- `src/background.js` stores the monitoring default.
- `src/popup.*` provides monitoring controls and opens the demo.
- `build.mjs` produces the loadable `dist` folder.

## Build on Windows PowerShell

```powershell
cd "C:\Users\Arsalan Ahmed\Desktop\Polite Ai\extension"
npm install
npm run build
```

In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension\dist`.

## Demo testing

Start the web app with `npm run dev`, open `http://127.0.0.1:5173/#demo-chat`, and load the unpacked extension. The content script detects elements with `data-demo-message`, automatically refreshes its analysis when the conversation changes, adds the Polite AI button, and observes messages added later. Pause/resume monitoring from the extension popup. Copy or insert a suggestion; the demo Send button remains the only way to add a message.

Permissions are limited to local HTTP pages, `activeTab`, and local storage. No conversation data is sent to a server by this demonstration.
