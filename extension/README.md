# Saylient AI browser extension

Manifest V3 extension for Saylient AI. It analyzes the text on any web page
with the real Saylient AI backend — never a canned demo, never automatic.

## What it does

- **Toolbar icon** — clicking it opens the official hero page,
  https://saylient-ai.vercel.app (no popup).
- **Floating ✦ button** — on every HTTPS page, a small button sits at the
  bottom-right. Clicking it opens an in-page panel.
- **Screen analysis** — the panel shows the text it will send: your current
  text selection first, otherwise the page's main readable text (capped at
  2000 characters), verbatim with a character count. You can edit it before
  anything is sent. Analysis runs **only** when you click **Analyze**.
- **Real suggestions** — intent, tone, face-threatening act, face concerns,
  relationship context (P / D / R), politeness strategy + rationale, an
  editable draft, and limitations, all from `POST /api/v1/analyses` on the
  live backend. Confidence is labelled "keyword-match strength
  (uncalibrated)" — the engine is the rule-based prototype v0.1, not a
  trained model or an LLM provider.
- **Tone + directness** — change them and click **Regenerate with these
  settings** to re-run the same analysis (`POST /analyses/{id}/regenerate`).
- **Copy / Insert** — copy the draft, or insert it into the field you were
  typing in. Insert happens **only** on an explicit click and never sends
  anything.
- **Context menu** — right-click selected text and choose **Analyze with
  Saylient AI** to open the panel prefilled with the selection.
- **Sign-in** — the panel has its own sign-in form (email + password,
  `POST /api/v1/auth/login`); the token is stored in `chrome.storage.local`
  and never leaves the browser except as a Bearer token to the API.

## What it never does

No auto-scan, no DOM monitoring (no `MutationObserver`), no auto-analyze,
no auto-send, no insert without a click. Nothing is read from a page until
you open the panel.

## Install from the download (Chrome)

1. Download **saylient-extension.zip** from https://saylient-ai.vercel.app
   (the "Download extension" button on the landing page) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode** (top-right).
3. Choose **Load unpacked** and select the unzipped folder.
4. Click the Saylient AI icon in the toolbar — it opens the hero page.
   On any page, click the floating ✦ button, sign in once, and Analyze.

## Build

```bash
cd extension
node build.mjs
```

This regenerates `extension/dist/` (the loadable extension), the
`manifest.json` (no `default_popup` — the icon opens the hero page), the
runtime `config.js` with the live origins, and
`public/saylient-extension.zip` — the downloadable build served by the site
at `/saylient-extension.zip`.

On Windows PowerShell, from the repo root:

```powershell
cd "C:\Users\Arsalan Ahmed\Desktop\Polite Ai\extension"
node build.mjs
```

Then load `extension\dist` unpacked as above, or use the zip from the site.

## Permissions

`storage` (session token), `activeTab`, `contextMenus` (right-click
analyze), `scripting` (inject the panel into a tab opened before install).
Host permissions: every HTTPS page (screen analysis) plus the API origin
(`https://saylient-ai-backend.onrender.com`).

## Files

- `src/background.js` — icon click → hero page; context menu → open panel.
- `src/content.js` — floating button, panel, screen-text collection, live
  analysis, copy/insert. The only file that touches page content.
- `src/content.css` — panel styling; all colours are `--sai-*` variables
  in `:root`, so a palette swap is one edit.
- `src/popup.*` — retained for reference; the toolbar icon no longer opens
  a popup, and sign-in lives in the panel.
- `build.mjs` — builds `dist/`, the manifest, the config, and the zip.
