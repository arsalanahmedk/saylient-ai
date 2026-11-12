/* End-to-end render test for the Saylient AI frontend (Phase A redesign).
   jsdom does not execute <script type="module">, and Vite emits the app
   as a self-contained IIFE bundle, so the harness fetches the bundle and
   injects it as a classic script. The app then runs against a real
   backend on :8000 with the built bundle served on :5173.

   Auth: the web app now signs in with an HttpOnly session cookie, but
   the API still accepts a Bearer token (the extension's client). The
   harness acts as a Bearer client: the injected fetch adds the
   Authorization header to API requests, which exercises the same
   Bearer-first auth path the live extension uses.

   Run: 1. cd backend && <venv>/bin/uvicorn app.main:app --port 8000
        2. npm run build && npx vite preview --host 127.0.0.1 --port 5173
        3. node tests/e2e/e2e.cjs   (needs jsdom + canvas in /tmp/saylient-e2e)
   Flows: landing (incl. demo output, no mock score) -> login form ->
   workspace dashboard (stats endpoint) -> assistant real analysis ->
   tone/directness selectors -> save draft -> regenerate (API) ->
   PATCH /auth/me (API) -> history. Fix round: gauge renders visibly,
   no stray "}" on the dashboard, unique chart y-axis ticks, payment
   draft has no invented "overdue", landing Run button visibly
   re-renders the selected demo scenario. Exits non-zero if any check fails. */
const { JSDOM } = require("jsdom");

const BASE = "http://127.0.0.1:5173";
const API = "http://127.0.0.1:8000/api/v1";

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
}

function waitFor(dom, fn, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      try {
        const v = fn(dom.window.document);
        if (v) return resolve(v);
      } catch (e) { /* keep waiting */ }
      if (Date.now() - start > timeoutMs) return reject(new Error("timeout"));
      setTimeout(tick, 150);
    };
    tick();
  });
}

/** Rendered app text only — excludes the injected bundle source. */
function rootText(doc) {
  const root = doc.getElementById("root");
  return root ? (root.textContent || "") : "";
}

let bundleCache = null;
let cssCache = null;
async function getCss() {
  if (cssCache) return cssCache;
  const html = await (await fetch(BASE + "/")).text();
  const m = html.match(/href="([^"]+\.css)"/);
  cssCache = m ? await (await fetch(BASE + m[1])).text() : "";
  return cssCache;
}

async function loadPage(url, { token } = {}) {
  const html = await (await fetch(BASE + "/")).text();
  if (!bundleCache) {
    const src = html.match(/src="([^"]+\.js)"/)[1];
    bundleCache = await (await fetch(BASE + src)).text();
  }
  const cleanHtml = html.replace(/<script type="module"[^>]*><\/script>/, "");
  const dom = new JSDOM(cleanHtml, {
    url,
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = (input, init = {}) => {
        // Bearer client: the app is cookie-first, the API also accepts
        // an Authorization header (extension path). Inject it here.
        if (token && typeof input === "string" && input.startsWith(API)) {
          init = { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } };
        }
        return fetch(input, init);
      };
      window.AbortController = AbortController; // node's, so undici recognises the signal
      window.AbortSignal = AbortSignal;
    },
  });
  dom.window.addEventListener("error", (e) => {
    console.log("  [page error]", String(e.error?.message || e.error || e.message).slice(0, 200));
  });
  const script = dom.window.document.createElement("script");
  script.textContent = bundleCache;
  dom.window.document.body.appendChild(script);
  return dom;
}

function findButton(doc, text) {
  return [...doc.querySelectorAll("button")].find((b) =>
    (b.textContent || "").replace(/\s+/g, " ").includes(text)
  );
}

(async () => {
  // --- A. Landing renders, with the new dark hero + demo window ---------
  let dom = await loadPage(BASE + "/");
  try {
    await waitFor(dom, (d) => rootText(d).includes("Say what you mean"));
    check("landing renders (hero headline)", true);
  } catch { check("landing renders (hero headline)", false); }
  const landingDoc = dom.window.document;
  check("landing has Sign in button", !!findButton(landingDoc, "Sign in"));
  check("landing has interactive analysis window", !!landingDoc.querySelector(".hero-window"));
  check("landing shows preset message pills", landingDoc.querySelectorAll(".preset-pills button").length >= 3);
  check("invented clarity-score mock is gone", !rootText(landingDoc).toLowerCase().includes("clarity score"));
  try {
    const demoBtn = findButton(landingDoc, "Run demo analysis");
    check("demo run button present (signed out)", !!demoBtn);
    if (demoBtn) {
      const outputBefore = landingDoc.querySelector(".hero-output");
      demoBtn.click();
      // A click must do something VISIBLE: a loading state first, then
      // the output re-renders (it is keyed so it remounts).
      try {
        await waitFor(dom, (d) => rootText(d).includes("Running demo analysis"));
        check("Run shows a visible loading state", true);
      } catch { check("Run shows a visible loading state", false); }
      await waitFor(dom, (d) => d.querySelector(".hero-output:not(.hero-output-loading)"));
      const outputAfter = landingDoc.querySelector(".hero-output");
      check("Run visibly re-renders the demo output", !!outputAfter && outputAfter !== outputBefore);
      // Switching the scenario pill and running again must show THAT
      // scenario's output (payment chase: invoice #1048, and the fixed
      // draft — no invented "overdue", payment close).
      const payPill = [...landingDoc.querySelectorAll(".preset-pills button")].find((b) => (b.textContent || "").includes("Chase a payment"));
      if (payPill) {
        payPill.click();
        // Wait until the pill's state has flushed into the displayed
        // message before running, or Run would analyse the old preset.
        await waitFor(dom, (d) => (d.querySelector(".hero-message")?.textContent || "").includes("invoice #1048"));
        const runBtn = findButton(landingDoc, "Run demo analysis");
        runBtn.click();
        await waitFor(dom, (d) => rootText(d).includes("Running demo analysis"));
        await waitFor(dom, (d) => d.querySelector(".hero-output:not(.hero-output-loading)"));
        const outText = (landingDoc.querySelector(".hero-output")?.textContent || "");
        check("Run shows the selected scenario output", outText.includes("invoice #1048"));
        check("demo payment draft has no invented overdue", !outText.toLowerCase().includes("overdue"));
        check("demo payment draft closes on the payment", outText.includes("once the payment is on its way"));
      } else {
        check("Run shows the selected scenario output", false, "no Chase a payment pill");
      }
    }
  } catch { check("demo output renders for visitors", false); }

  // --- B. Login form renders ---------------------------------------------
  dom = await loadPage(BASE + "/#login");
  try {
    const form = await waitFor(dom, (d) => d.querySelector(".auth-card form"));
    const email = form.querySelector('input[type="email"]');
    const password = form.querySelector('input[type="password"]');
    check("login form renders (email + password)", !!email && !!password);
  } catch { check("login form renders (email + password)", false); }

  // --- C. Create a test user directly through the API --------------------
  const email = `e2e-${Date.now()}@example.com`;
  const reg = await fetch(API + "/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "E2ePass123!", display_name: "E2E Tester" }),
  });
  const auth = await reg.json();
  check("API register works", reg.status === 201 && !!auth.token);
  check("register sets a session cookie", !!reg.headers.get("set-cookie"));
  const token = auth.token;

  // --- D. Workspace dashboard renders with real stats --------------------
  dom = await loadPage(BASE + "/#overview", { token });
  try {
    await waitFor(dom, (d) => rootText(d).includes("Messages analyzed"));
    const text = rootText(dom.window.document);
    check("dashboard renders real stats", text.includes("Messages analyzed") && text.includes("E2E"));
    check("dashboard shows activity chart + insights", text.includes("Communication activity") && text.includes("Recent AI insights"));
    const yLabels = [...dom.window.document.querySelectorAll(".chart-y span")].map((s) => s.textContent);
    check("chart y-axis labels are unique integers", yLabels.length >= 2 && new Set(yLabels).size === yLabels.length, yLabels.join(","));
    const insights = dom.window.document.querySelector(".insights-panel");
    check("no stray } on the dashboard insights", !!insights && !insights.textContent.includes("}"));
  } catch { check("dashboard renders real stats", false); }

  // --- E. Assistant: real analysis, tone/directness, save draft ---------
  dom = await loadPage(BASE + "/#assistant", { token });
  const doc = dom.window.document;
  let analysisId = null;
  try {
    await waitFor(dom, (d) => findButton(d, "Analyze conversation"));
    check("assistant shows goal pills + P/D/R selects", doc.querySelectorAll(".goal-pills button").length >= 7 && doc.querySelectorAll(".field-row select").length === 3);
    const btn = findButton(doc, "Analyze conversation");
    btn.click();
    await waitFor(dom, (d) => rootText(d).includes("Recommended strategy"));
    const text = rootText(dom.window.document);
    check("assistant runs a real analysis", text.includes("Live analysis") && text.includes("Recommended strategy"));
    check("result shows intent + confidence", /Intent[\s\S]{0,60}\d+%/.test(text));
    check("result shows original message", text.includes("final files today"));
    check("confidence is labelled uncalibrated", text.includes("keyword-match strength (uncalibrated)"));
    check("tone + directness selectors present", !!findButton(doc, "Diplomatic") && !!findButton(doc, "Balanced"));
    check("regenerate button present", !!findButton(doc, "Regenerate"));
    const saveBtn = findButton(doc, "Save draft");
    check("Save draft button present", !!saveBtn);
    if (saveBtn) {
      saveBtn.click();
      await waitFor(dom, (d) => rootText(d).includes("Draft saved to this analysis."));
      check("draft saves to the backend", true);
    }
    const list = await (await fetch(API + "/analyses?limit=1", { headers: { Authorization: `Bearer ${token}` } })).json();
    analysisId = list.items?.[0]?.id || null;
    check("analysis persisted (API list)", !!analysisId);
    // --- Fix round: gauge renders visibly (ring + number, not a disc) ---
    const ring = doc.querySelector(".score-ring");
    const track = doc.querySelector(".score-ring svg circle.ring-track");
    const valueArc = doc.querySelector(".score-ring svg circle.ring-value");
    check("gauge ring + number render", !!ring && !!track && !!valueArc && /(\d+)%/.test(ring.textContent || ""));
    check("gauge arc has a visible dash", !!valueArc && !!valueArc.getAttribute("stroke-dasharray"));
    const builtCss = await getCss();
    check("gauge track is transparent (not a black disc)", /\.ring-track\{[^}]*fill\s*:\s*none/.test(builtCss));
    check("gauge value arc has a stroke colour", /\.ring-value\{[^}]*stroke\s*:/.test(builtCss));
    check("confidence note sits below the ring, not inside it", !!doc.querySelector(".ring-caption") && !doc.querySelector(".ring-label small"));
    // --- Fix round: payment draft invents no facts (UI-level) -----------
    const paymentMsg = "Hi, I still haven't received the payment for invoice #1048. Could you please let me know when it will be sent?";
    const msgBox = doc.querySelector(".assistant-form textarea");
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(msgBox, paymentMsg);
    msgBox.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    findButton(doc, "Analyze conversation").click();
    await waitFor(dom, (d) => (d.querySelector(".draft-editor")?.value || "").includes("invoice #1048"));
    const paymentDraft = doc.querySelector(".draft-editor").value;
    check("payment draft has no invented overdue", !paymentDraft.toLowerCase().includes("overdue"));
    check("payment draft closes on the payment", paymentDraft.trimEnd().endsWith("once the payment is on its way."));
    // Remove the payment analysis so the totals in section F stay at 1.
    const afterList = await (await fetch(API + "/analyses?limit=5", { headers: { Authorization: `Bearer ${token}` } })).json();
    const paymentRow = (afterList.items || []).find((a) => (a.message || "").includes("still haven't received"));
    if (paymentRow) await fetch(API + `/analyses/${paymentRow.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    const cleaned = await (await fetch(API + "/analyses?limit=10", { headers: { Authorization: `Bearer ${token}` } })).json();
    check("payment analysis cleaned up (total stays 1)", cleaned.total === 1);
  } catch (e) {
    check("assistant runs a real analysis", false, String(e.message || e).slice(0, 120));
  }

  // --- F. New endpoints: stats, regenerate, PATCH /auth/me --------------
  if (analysisId) {
    const stats = await (await fetch(API + "/analyses/stats", { headers: { Authorization: `Bearer ${token}` } })).json();
    check("GET /analyses/stats returns live totals", stats.total === 1 && Array.isArray(stats.buckets_30d) && stats.buckets_30d.length === 5);
    const regen = await fetch(API + `/analyses/${analysisId}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tone: "Assertive", directness: "direct" }),
    });
    const regenBody = await regen.json();
    check("POST /analyses/{id}/regenerate re-runs in place", regen.status === 200 && regenBody.id === analysisId);
    const after = await (await fetch(API + "/analyses?limit=10", { headers: { Authorization: `Bearer ${token}` } })).json();
    check("regenerate adds no duplicate history row", after.total === 1);
    const me = await fetch(API + "/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ display_name: "E2E Renamed" }),
    });
    const meBody = await me.json();
    check("PATCH /auth/me updates display name", me.status === 200 && meBody.display_name === "E2E Renamed");
  } else {
    check("GET /analyses/stats returns live totals", false, "no analysis id");
    check("POST /analyses/{id}/regenerate re-runs in place", false, "no analysis id");
    check("regenerate adds no duplicate history row", false, "no analysis id");
    check("PATCH /auth/me updates display name", false, "no analysis id");
  }

  // --- G. History shows the saved analysis -------------------------------
  dom = await loadPage(BASE + "/#history", { token });
  try {
    await waitFor(dom, (d) => rootText(d).includes("1 saved"));
    const text = rootText(dom.window.document);
    check("history lists the saved analysis", text.includes("final files today") || text.includes("Set boundary"));
  } catch { check("history lists the saved analysis", false); }

  console.log(failures === 0 ? "\nALL E2E CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("E2E harness error:", e);
  process.exit(2);
});
