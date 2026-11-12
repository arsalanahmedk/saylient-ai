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

The workspace (login, real analysis, history, templates) needs **two
servers**: the backend API and the web app. Open two terminals.

**Terminal 1 — backend** (Python 3.12+):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

The API runs at http://127.0.0.1:8000 (health check: `/health`). It uses a
local SQLite file (`saylient.db`, ignored by git). Copy
`backend/.env.example` to `backend/.env` to change settings.

**Terminal 2 — web app:**

```powershell
npm install
npm run dev
```

Open http://127.0.0.1:5173/ — create an account, then the assistant is on the
**Message assistant** page. The demo chat is at `#demo-chat` (no account
needed).

The web app talks to the API at `VITE_API_URL` (default
`http://127.0.0.1:8000/api/v1`). Copy the root `.env.example` to `.env` to
point it at a deployed backend.

```powershell
npm run build   # production build into dist/
```

If the assistant shows "Could not reach the Saylient AI backend", the
backend (terminal 1) is not running.

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

React 18, Vite 6, Framer Motion, Lucide icons. **Backend:** FastAPI +
SQLAlchemy + SQLite (`backend/`, 24 endpoints under `/api/v1`, rule-based
analysis engine `prototype-0.1`, pytest suite). The frontend talks to it
through `src/api.js`; the old in-browser demo analysis is gone.

## How the pieces fit

- **Web app** — landing + workspace (assistant, dashboard, history,
  templates, theory, settings, profile). Sign in to use it; the demo chat
  is the only part that works without an account.
- **Backend** — auth (register/login/logout, password reset), analyses,
  drafts, templates, privacy export / account deletion. Ownership is
  checked on every resource; P/D/R are never guessed.
