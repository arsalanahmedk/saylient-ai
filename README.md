# Saylient AI

**Saylient AI** (formerly PoliteAI) is an AI-based freelancer communication
assistant. It helps freelancers review a message before sending it — checking
intent, tone and politeness strategy, and suggesting a clearer rewrite — so
the message keeps its intent but lands better.

Built on **Brown & Levinson's Politeness Theory (1987)**. Final-year project
(PAF-IAST), by Arsalan Ahmed Khan.

> This is a local demo. Analysis is illustrative and labelled as such.
> No message is ever sent automatically.

## What is inside

- **Web app** (`src/`, Vite + React 18 + Framer Motion) — landing page,
  workspace dashboard, message assistant, communication analysis, conversation
  history (saved in your browser), saved templates, politeness theory, and a
  local demo chat.
- **Browser extension** (`extension/`, Manifest V3) — a floating assistant
  for the demo chat page. It reads the local demo conversation, prepares a
  response for review, and can copy it or insert it into the composer.
  It never sends messages on its own.
- **Docs** (`freelancer_communication_assistant_docs/`) — PRD/SRS, architecture,
  UX spec, data design, AI/ML plan, API spec and engineering guides.

## Run the web app

```powershell
npm install
npm run dev
```

Open http://127.0.0.1:5173/ — the assistant is on the **Message assistant** page,
the demo chat is at `#demo-chat`.

```powershell
npm run build   # production build into dist/
```

## Load the extension (Chrome)

1. Build it first (from the `extension/` folder):
   ```powershell
   cd extension
   node build.mjs
   ```
   This regenerates `extension/dist/` and the matching files at the repo root.
2. Open `chrome://extensions`, enable **Developer mode**, choose
   **Load unpacked** and select `extension/dist`.
3. Start the web app (`npm run dev`), open
   http://127.0.0.1:5173/#demo-chat — the Saylient AI button appears on the
   page. Click it to open the floating assistant; use **Copy response** or
   **Insert into composer**. The demo Send button is the only way a message
   is added. Pause/resume monitoring from the extension popup.

The extension only runs on local pages (`localhost` / `127.0.0.1`) and uses
`activeTab` + local storage. No conversation data is sent to a server.

## Tech

React 18, Vite 6, Framer Motion, Lucide icons. No backend — the demo
analysis runs in the browser.
