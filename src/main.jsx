import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight, BarChart3, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp,
  Clipboard, Clock3, Copy, Download, Gauge, Github, Globe2, History, LayoutDashboard,
  Lightbulb, Linkedin, LoaderCircle, LogOut, Mail, Menu, MessageSquare, MoreHorizontal, PenLine,
  Plus, RotateCw, Search, Send, Settings, ShieldCheck, Sparkles, Target, Trash2,
  UserRound, WandSparkles, X, Zap
} from "lucide-react";
import "./styles.css";
import { api, friendlyError, prettyLabel, GOAL_VALUES, GOAL_LABELS, TONE_OPTIONS, DIRECTNESS_OPTIONS, CONFIDENCE_NOTE } from "./api";

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

const GOAL_OPTIONS = ["Set a boundary", "Request payment", "Negotiate deadline", "Clarify requirements", "Respond to criticism", "Negotiate budget", "Resolve disagreement"];
const PDR_OPTIONS = ["unknown", "low", "medium", "high"];

const navItems = [
  ["overview", "Overview", LayoutDashboard],
  ["assistant", "Message assistant", MessageSquare],
  ["analysis", "Communication analysis", BarChart3],
  ["history", "Conversation history", History],
  ["templates", "Saved templates", Clipboard],
  ["theory", "Politeness theory", BookOpen],
  ["extension", "Browser extension", Globe2],
  ["contact", "Contact", Mail],
  ["settings", "Settings", Settings],
  ["profile", "Profile", UserRound],
];

/* Landing hero presets. The "demo output" for each preset is the REAL
   output of the rule-based engine (model prototype-0.1) for that message
   and goal, computed once and embedded here — it is labelled as a demo,
   and a signed-in visitor gets a live analysis instead. */
const DEMO_PRESETS = [
  {
    label: "Set a boundary",
    goal: "Set a boundary",
    message: "The extra revisions are outside the agreed scope, so I would like to treat them as a separate task.",
    result: {
      intent: { label: "set_boundary", confidence: 0.87 },
      tone: { label: "neutral", confidence: 0.3 },
      strategy: { label: "negative_politeness", rationale: "No rule strongly favours a direct response, so the response hedges and respects the recipient's autonomy." },
      draft: "Hi,\n\nThat change is outside the agreed scope, so I'd like to treat it as a separate task. I'm happy to schedule it once we've agreed on it.\n\nPlease let me know what works for you.",
      model_version: "prototype-0.1",
    },
  },
  {
    label: "Move a deadline",
    goal: "Negotiate deadline",
    message: "Could we move the deadline to Friday? I need a bit more time.",
    result: {
      intent: { label: "negotiate_deadline", confidence: 0.83 },
      tone: { label: "direct", confidence: 0.57 },
      strategy: { label: "negative_politeness", rationale: "Payment and deadline pressure constrain the recipient's time, so the response hedges and leaves room to respond." },
      draft: "Hi,\n\nWould it be possible to move the deadline to Friday? I want to make sure the quality stays high.\n\nPlease let me know what works for you.",
      model_version: "prototype-0.1",
    },
  },
  {
    label: "Chase a payment",
    goal: "Request payment",
    message: "Hi, I wanted to check in on invoice #1048 — it has been overdue for two weeks. Could you let me know when the payment will be sent?",
    result: {
      intent: { label: "request_payment", confidence: 0.87 },
      tone: { label: "diplomatic", confidence: 0.64 },
      strategy: { label: "negative_politeness", rationale: "Payment and deadline pressure constrain the recipient's time, so the response hedges and leaves room to respond." },
      draft: "Hi,\n\nI wanted to check in on invoice #1048. Could you let me know when the payment will be sent?\n\nThank you — please let me know once the payment is on its way.",
      model_version: "prototype-0.1",
    },
  },
];

const PIPELINE_STAGES = [
  { name: "Message", log: "Reading your message…" },
  { name: "Intent", log: "Classifying intent and tone…" },
  { name: "Face", log: "Checking for face-threatening acts…" },
  { name: "Strategy", log: "Choosing a politeness strategy…" },
  { name: "Draft", log: "Drafting a response you can edit…" },
];

/* The Saylient mark: a geometric "S" (two cubic bowls on a 24-unit grid)
   followed by three vertical bars of decreasing height (7, 4, 2) — the
   voice fading into silence. One flat colour (currentColor, so it follows
   the palette: warm orange on the dark tile, warm orange everywhere else;
   the standalone SVG files carry the full sunset gradient).
   The S is deliberately unclosed: the message pauses before it is sent. */
const LOGO_S_PATH = "M17.5 7C17.5 4.2 15 2.5 12 2.5C9 2.5 6.5 4.2 6.5 7C6.5 9.8 9 11.5 12 11.5C15 11.5 17.5 13.2 17.5 16C17.5 18.8 15 20.5 12 20.5C9 20.5 6.5 18.8 6.5 16";
const LOGO_WAVE_PATH = "M20.5 8.5V15.5M23 10V14M25.5 11V13";

function LogoMark() {
  return <svg viewBox="0 0 30 24" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d={LOGO_S_PATH} /><path d={LOGO_WAVE_PATH} /></g></svg>;
}

function Logo() {
  return <div className="logo"><span className="logo-icon"><LogoMark /></span><span>Saylient<span className="logo-ai">AI</span></span></div>;
}

/* Section links on the landing used plain #hash anchors, which the hash
   router reads as page names — clicking one kicked the visitor to the
   sign-in page. Route through go() and scroll after the render. */
function goSection(go, id) {
  go("landing");
  window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 60);
}

function Button({ children, variant = "primary", onClick, icon: Icon, type = "button", disabled }) {
  return <button type={type} className={`btn btn-${variant}`} onClick={onClick} disabled={disabled}>
    {Icon && <Icon size={15} />}
    <span>{children}</span>
  </button>;
}

/** Number ticker: counts 0 -> value over ~700ms (instant when the user prefers reduced motion). */
function CountUp({ value }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) { setDisplay(value); return undefined; }
    let raf = 0;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / 700);
      setDisplay(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);
  return <>{display}</>;
}

/** Score ring: intent confidence as an animated ring (0 -> value in 800ms). */
function ScoreRing({ value, size = 132 }) {
  const reduce = useReducedMotion();
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const percent = Math.round((value || 0) * 100);
  return <div className="score-ring" style={{ width: size, height: size }}>
    <svg viewBox="0 0 132 132">
      <circle cx="66" cy="66" r={r} className="ring-track" />
      <motion.circle
        cx="66" cy="66" r={r} className="ring-value"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: circumference * (1 - (value || 0)) }}
        transition={{ duration: reduce ? 0 : 0.8, ease: "easeOut" }}
      />
    </svg>
    <div className="ring-label"><strong>{percent}%</strong><span>intent confidence</span></div>
  </div>;
}

/* Wordtune-style rewrite demo: a blunt freelancer message, with REAL
   rule-based engine output (model prototype-0.1) for three tones.
   Generated locally from backend/app/services/analysis_engine.py:
   Formal = tone Professional / directness balanced,
   Casual = tone Friendly / balanced,
   Shorten = tone Assertive / direct.
   Visitors see these precomputed drafts (labelled as a demo); a signed-in
   visitor who picks a tone gets a LIVE analysis instead. */
const REWRITE_DEMO = {
  message: "You still haven't paid invoice #1048. It has been two weeks. Send the payment now.",
  goal: "Request payment",
  phrases: [
    { text: "still haven't paid", note: "An accusation. The rewrite turns it into a check-in." },
    { text: "Send the payment now.", note: "A demand. The rewrite turns it into a question." },
  ],
  intent: { label: "request_payment", confidence: 0.85 },
  tone: { label: "direct", confidence: 0.47 },
  strategy: { label: "negative_politeness" },
  variants: [
    { label: "Formal", tone: "Professional", directness: "balanced", note: "Polite, business-like", draft: "Hello,\n\nI wanted to check in on invoice #1048. Could you let me know when the payment will be sent?\n\nThank you — please let me know once the payment is on its way." },
    { label: "Casual", tone: "Friendly", directness: "balanced", note: "Warm, easy-going", draft: "Hi there,\n\nI wanted to check in on invoice #1048. Could you let me know when the payment will be sent?\n\nThank you — please let me know once the payment is on its way." },
    { label: "Shorten", tone: "Assertive", directness: "direct", note: "Short and to the point", draft: "Hi,\n\nI'm following up on invoice #1048. Please let me know when the payment will be sent?\n\nPlease let me know." },
  ],
};

function PhraseRewriteDemo({ go, user }) {
  const [activePhrase, setActivePhrase] = useState(0);
  const [liveDrafts, setLiveDrafts] = useState({});
  const [liveBusy, setLiveBusy] = useState(null);
  const [liveError, setLiveError] = useState("");
  const demo = REWRITE_DEMO;

  const runLive = async (variant) => {
    if (!user || liveBusy) return;
    setLiveBusy(variant.label); setLiveError("");
    try {
      const result = await api.createAnalysis({
        message: demo.message,
        conversation_context: [],
        goal: GOAL_VALUES[demo.goal],
        context: { power: "unknown", social_distance: "unknown", imposition: "unknown" },
        tone: variant.tone,
        directness: variant.directness,
      });
      setLiveDrafts(prev => ({ ...prev, [variant.label]: result.draft }));
    } catch (err) { setLiveError(friendlyError(err)); }
    setLiveBusy(null);
  };

  // Render the blunt message with its two sharp phrases underlined and
  // clickable — tapping one selects it and explains what the rewrite does.
  const parts = [];
  let rest = demo.message;
  demo.phrases.forEach((phrase, i) => {
    const idx = rest.indexOf(phrase.text);
    if (idx === -1) return;
    if (idx > 0) parts.push(<span key={`t${i}`}>{rest.slice(0, idx)}</span>);
    parts.push(<button key={`p${i}`} type="button" className={`rewrite-phrase${activePhrase === i ? " active" : ""}`} onClick={() => setActivePhrase(i)}>{phrase.text}</button>);
    rest = rest.slice(idx + phrase.text.length);
  });
  if (rest) parts.push(<span key="tail">{rest}</span>);

  return <div className="rewrite-demo">
    <div className="rewrite-demo-head">
      <span className="rewrite-demo-label"><WandSparkles size={14} /> Try it — tap an underlined phrase</span>
      <span className="rewrite-demo-note">{user ? "Pick a tone for a live rewrite" : "Precomputed demo · prototype-0.1"}</span>
    </div>
    <p className="rewrite-demo-message">“{parts}”</p>
    <p className="rewrite-phrase-note"><b>“{demo.phrases[activePhrase].text}”</b> — {demo.phrases[activePhrase].note}</p>
    <div className="rewrite-demo-meta">
      <span><b>Intent</b> {prettyLabel(demo.intent.label)} · {Math.round(demo.intent.confidence * 100)}%</span>
      <span><b>Tone</b> {prettyLabel(demo.tone.label)} · blunt</span>
      <span><b>Strategy</b> {prettyLabel(demo.strategy.label)}</span>
    </div>
    <div className="rewrite-cards">
      {demo.variants.map(v => {
        const live = liveDrafts[v.label];
        const busy = liveBusy === v.label;
        return <button key={v.label} type="button" className="rewrite-card" onClick={() => runLive(v)}>
          <span className="rewrite-card-tone">{v.label}<small>{v.note}</small></span>
          <span className="rewrite-card-draft">{busy ? "Running live analysis…" : live || v.draft}</span>
          <span className="rewrite-card-foot">{live ? "Live analysis · prototype-0.1" : user ? "Tap for a live rewrite" : "Precomputed demo · prototype-0.1"}</span>
        </button>;
      })}
    </div>
    {liveError && <div className="form-error">{liveError}</div>}
    <p className="rewrite-demo-cta">Want the full breakdown — intent, face concerns, strategy? <button className="link-button" onClick={() => go("assistant")}>Open the assistant <ArrowRight size={13} /></button></p>
  </div>;
}

/* Magic UI-style animated beam: the places people write feed into Saylient.
   CSS-only — a black dot travels along each connector. */
const BEAM_APPS = ["Gmail", "Slack", "WhatsApp", "Upwork"];

function BeamDiagram() {
  return <div className="beam-diagram">
    <div className="beam-apps">
      {BEAM_APPS.map((app, i) => <div className="beam-row" key={app}>
        <span className="beam-app">{app}</span>
        <span className="beam-track"><i style={{ animationDelay: `${i * 0.55}s` }} /></span>
      </div>)}
    </div>
    <div className="beam-center"><span className="beam-center-mark">✦</span><strong>Saylient</strong><small>Live analysis</small></div>
  </div>;
}

/* How it works — a 3-card bento. Every visual is real product UI:
   analysis chips and a draft from the rule-based engine (precomputed
   demo, labelled), and recent-analysis rows from the same demo presets. */
function HowItWorks({ go }) {
  const reduce = useReducedMotion();
  const demo = DEMO_PRESETS[2];
  return <section id="how" className="how-section shell">
    <div className="center-heading"><div className="eyebrow">How it works</div><h2>From thought <em>to send.</em></h2><p>Communication theory, turned into practical help you can use in seconds.</p></div>
    <div className="how-bento">
      <motion.article className="how-card" initial={reduce ? false : { opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.55, delay: 0, ease: "easeOut" }}><span className="how-num">01</span><h3>Analyze the message</h3><p>Paste a message and see intent, tone and face concerns — before you reply.</p><div className="how-visual"><div className="hero-output-tags"><span><b>Intent</b> {prettyLabel(demo.result.intent.label)} · {Math.round(demo.result.intent.confidence * 100)}%</span><span><b>Tone</b> {prettyLabel(demo.result.tone.label)}</span><span><b>Strategy</b> {prettyLabel(demo.result.strategy.label)}</span></div><span className="how-note">Precomputed demo · prototype-0.1</span></div></motion.article>
      <motion.article className="how-card" initial={reduce ? false : { opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.55, delay: 0.1, ease: "easeOut" }}><span className="how-num">02</span><h3>Get a draft reply</h3><p>An editable draft in your words, with tone options — formal, casual or short.</p><div className="how-visual"><p className="hero-draft">{demo.result.draft}</p><span className="how-note">Precomputed demo · prototype-0.1</span></div></motion.article>
      <motion.article className="how-card" initial={reduce ? false : { opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.55, delay: 0.2, ease: "easeOut" }}><span className="how-num">03</span><h3>Use it anywhere</h3><p>The extension brings the same analysis into the places you already write — and every analysis is saved to your history.</p><div className="how-visual">{DEMO_PRESETS.map(p => <div className="how-row" key={p.label}><div className="conversation-icon"><MessageSquare size={16} /></div><div className="conversation-name"><strong>{prettyLabel(p.result.intent.label)}</strong><span>{p.message}</span></div><span className="score-pill"><span /> {Math.round(p.result.intent.confidence * 100)}%</span></div>)}<span className="how-note">Your recent analyses, as they appear in the workspace.</span></div></motion.article>
    </div>
    <div className="center-heading" style={{ marginTop: 32 }}><Button onClick={() => go("assistant")} icon={WandSparkles}>Try the assistant</Button></div>
  </section>;
}

/* Feature tabs — one product area at a time. Analyse shows the real
   breakdown for a demo preset; Suggested messages is the Wordtune-style
   tone demo; Connect anywhere is the extension beam; Assistant chat is a
   look at the demo conversation; Activity timeline is real history when
   signed in, labelled samples when not. */
const FEATURE_TABS = ["Analyse", "Suggested messages", "Connect anywhere", "Assistant chat", "Activity timeline"];

function ActivityTab({ go, user }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return undefined;
    api.listAnalyses(5, 0)
      .then(d => setItems(d.items || []))
      .catch(e => setError(friendlyError(e)));
    return undefined;
  }, [user]);
  if (!user) {
    return <div className="tab-note"><p>Sign in and your real activity timeline appears here — every analysis you run, newest first.</p>
      <ol className="activity-timeline">{DEMO_PRESETS.map(p => <li key={p.label}><span className="timeline-dot" /><div><strong>{prettyLabel(p.result.intent.label)}</strong><span>{p.message}</span><small>Sample · precomputed demo · prototype-0.1</small></div></li>)}</ol></div>;
  }
  if (error) return <div className="form-error">{error}</div>;
  if (items === null) return <div className="tab-note"><p>Loading your activity…</p></div>;
  if (!items.length) return <div className="tab-note"><p>Nothing analyzed yet — your timeline will fill in as you use the assistant.</p><Button onClick={() => go("assistant")} icon={Sparkles}>Analyze a message</Button></div>;
  return <ol className="activity-timeline">{items.map(item => <li key={item.id}><span className="timeline-dot" /><div><strong>{prettyLabel(item.intent?.label)} · {Math.round((item.intent?.confidence || 0) * 100)}%</strong><span>{item.message}</span><small>{new Date(item.created_at).toLocaleDateString()} · {prettyLabel(item.strategy?.label)}</small></div><button className="secondary-action" onClick={() => go("assistant")}>Open</button></li>)}</ol>;
}

function FeatureTabs({ go, user }) {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState(0);
  const demo = DEMO_PRESETS[2];
  return <section id="features" className="tabs-section shell">
    <div className="center-heading"><div className="eyebrow">The communication studio</div><h2>One calm layer between<br /><em>thinking and sending.</em></h2><p>From a quick follow-up to a difficult boundary, get context-aware guidance before you hit send.</p></div>
    <div className="tabs-nav" role="tablist">{FEATURE_TABS.map((label, i) => <button key={label} role="tab" aria-selected={tab === i} className={tab === i ? "active" : ""} onClick={() => setTab(i)}>{label}</button>)}</div>
    <div className="tab-panel">
      <motion.div key={tab} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: "easeOut" }}>
      {tab === 0 && <div className="tab-grid"><div><h3>See what a message really asks for.</h3><p>The engine reads intent, tone and social dynamics without guessing what anyone feels — and tells you how sure it is.</p><div className="hero-output-tags"><span><b>Intent</b> {prettyLabel(demo.result.intent.label)} · {Math.round(demo.result.intent.confidence * 100)}%</span><span><b>Tone</b> {prettyLabel(demo.result.tone.label)}</span><span><b>Strategy</b> {prettyLabel(demo.result.strategy.label)}</span></div><span className="how-note">Precomputed demo · prototype-0.1</span><div style={{ marginTop: 18 }}><Button onClick={() => go("assistant")} icon={WandSparkles}>Open the analyzer</Button></div></div><div className="tab-frame"><ScoreRing value={0.87} /><span className="how-note">Intent confidence · boundary preset · precomputed demo</span></div></div>}
      {tab === 1 && <div><h3>Three ways to say the same thing.</h3><p>Tap an underlined phrase, pick a tone — the drafts are real engine output.</p><div style={{ marginTop: 18 }}><PhraseRewriteDemo go={go} user={user} /></div></div>}
      {tab === 2 && <div className="tab-grid"><div><h3>Wherever you write.</h3><p>The extension brings live analysis into the conversations you already have — Gmail, Slack, WhatsApp, Upwork. Nothing is monitored or sent on its own.</p><div className="extension-actions" style={{ marginTop: 18 }}><a className="button" href="/saylient-extension.zip" download><Download size={15} /><span>Download extension</span></a><Button variant="outline" onClick={() => go("extension")}>Learn about the extension <ArrowRight size={15} /></Button></div></div><BeamDiagram /></div>}
      {tab === 3 && <div className="tab-grid"><div><h3>Practice in a safe conversation.</h3><p>A local demo chat where you can try a draft before it matters — nothing leaves the page.</p><div style={{ marginTop: 18 }}><Button onClick={() => go("demo-chat")} icon={Globe2}>Open the demo chat</Button></div></div><div className="tab-frame tab-chat"><div className="demo-message"><span className="demo-author">Alex</span><p>Hi! I wanted to check whether the homepage concepts will be ready today.</p></div><div className="demo-message freelancer"><span className="demo-author">You</span><p>Hi Alex, I am putting the final details together now.</p></div><span className="how-note">From the local demo chat — no account needed.</span></div></div>}
      {tab === 4 && <div><h3>Your work, in order.</h3><p>Every analysis is saved to your account — search it, reopen it, delete it.</p><div style={{ marginTop: 18 }}><ActivityTab go={go} user={user} /></div></div>}
      </motion.div>
    </div>
  </section>;
}

/* Dashboard preview — signed-in visitors only, and only REAL data:
   stats from GET /analyses/stats and the latest analyses. Nothing here
   is a mockup. */
function DashboardPreview({ go }) {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api.getStats(), api.listAnalyses(3, 0)])
      .then(([s, a]) => { setStats(s); setRecent(a.items || []); })
      .catch(e => setError(friendlyError(e)));
  }, []);
  const avgConf = stats?.avg_intent_confidence == null ? null : Math.round(stats.avg_intent_confidence * 100);
  return <section className="preview-section shell">
    <div className="section-heading"><div><div className="eyebrow">Your workspace at a glance</div><h2>Real numbers, <em>your account.</em></h2></div><p>Nothing here is a mockup — these are your actual analyses, live from your account.</p></div>
    {error && <div className="form-error">{error}</div>}
    <div className="stats-grid">
      <Stat title="Messages analyzed" value={stats?.total ?? 0} change={`${stats?.this_week ?? 0} this week`} icon={MessageSquare} color="accent" />
      <Stat title="Avg. intent confidence" value={avgConf === null ? "—" : `${avgConf}%`} change={CONFIDENCE_NOTE} icon={Gauge} color="black" />
      <Stat title="Flagged face concerns" value={stats?.fta_count ?? 0} change={stats?.total ? `${Math.round((stats.fta_count / stats.total) * 100)}% of messages` : "No analyses yet"} icon={Clock3} color="slate" />
      <Stat title="Most common intent" value={stats?.top_intent ? prettyLabel(stats.top_intent) : "—"} change={stats?.top_strategy ? `Usual strategy: ${prettyLabel(stats.top_strategy)}` : "No analyses yet"} icon={Target} color="grey" />
    </div>
    <div className="panel recent-panel"><div className="panel-heading"><div><h3>Recent conversations</h3><p>Your latest analyses</p></div><button className="link-button" onClick={() => go("history")}>View all <ArrowRight size={14} /></button></div>
      {recent.length ? <div className="conversation-table">{recent.map(c => <div className="conversation-row" key={c.id}><div className="conversation-icon"><MessageSquare size={16} /></div><div className="conversation-name"><strong>{prettyLabel(c.intent?.label)}</strong><span>{c.message}</span></div><span className="conversation-date">{new Date(c.created_at).toLocaleDateString()}</span><div className="score-pill"><span /> {Math.round((c.intent?.confidence || 0) * 100)}%</div></div>)}</div> : <div className="placeholder-page" style={{ minHeight: 160 }}><div className="placeholder-icon"><History size={25} /></div><h2>No analyses yet.</h2><p>Your first analysis will appear here.</p><Button onClick={() => go("assistant")} icon={Sparkles}>Analyze a message</Button></div>}
    </div>
  </section>;
}

/* Lex-style pricing, pattern only: two cards, Free vs Pro, benefits-led.
   No prices are invented — Pro is coming soon, so its card says so and
   points at Contact instead of a checkout. */
function PricingSection({ go }) {
  const reduce = useReducedMotion();
  return <section id="pricing" className="pricing-section shell">
    <div className="center-heading"><div className="eyebrow">Simple, honest pricing</div><h2>Start free.<br /><em>Grow when you're ready.</em></h2><p>No card, no surprise charges. The extension is free — Pro unlocks more when you need it.</p></div>
    <div className="pricing-grid">
      <motion.article className="pricing-card" initial={reduce ? false : { opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.55, ease: "easeOut" }}><h3>Free</h3><p className="pricing-tag">For trying it out</p><ul><li><Check size={14} /> Browser extension</li><li><Check size={14} /> Real backend analyses</li><li><Check size={14} /> All five politeness strategies</li><li><Check size={14} /> Saved drafts and history</li></ul><Button onClick={() => go("register")}>Create a free account</Button></motion.article>
      <motion.article className="pricing-card pro" initial={reduce ? false : { opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.55, delay: 0.12, ease: "easeOut" }}><span className="pricing-soon">Coming soon</span><h3>Pro</h3><p className="pricing-tag">For freelancers who write all day</p><ul><li><Check size={14} /> Unlimited analyses</li><li><Check size={14} /> Priority analysis</li><li><Check size={14} /> Everything in Free</li></ul><Button variant="outline" onClick={() => go("contact")}>Talk to us about Pro</Button></motion.article>
    </div>
    <div className="teams-strip"><span>Teams</span><p>Shared templates and a team workspace — coming later.</p><button className="link-button" onClick={() => go("contact")}>Tell me when it's ready <ArrowRight size={13} /></button></div>
  </section>;
}

function HalftoneFooter({ go }) {
  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return undefined;
    const context = canvas.getContext("2d");
    if (!context) return undefined; // canvas unavailable (e.g. disabled): the footer simply stays blank.
    let pointer = { x: -1000, y: -1000 };
    const draw = () => {
      const rect = root.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      const gap = Math.max(5, Math.min(8, rect.width / 180));
      const fontSize = Math.min(rect.width * 0.34, 430);
      const mask = document.createElement("canvas");
      mask.width = rect.width;
      mask.height = rect.height;
      const maskContext = mask.getContext("2d");
      maskContext.font = `600 ${fontSize}px "Space Grotesk", "Inter", sans-serif`;
      maskContext.textAlign = "center";
      maskContext.textBaseline = "alphabetic";
      maskContext.fillStyle = "#fff";
      maskContext.fillText("saylient", rect.width / 2, rect.height + fontSize * 0.12);
      const pixels = maskContext.getImageData(0, 0, rect.width, rect.height).data;
      for (let y = gap / 2; y < rect.height; y += gap) {
        for (let x = gap / 2; x < rect.width; x += gap) {
          const alpha = pixels[(Math.floor(y) * rect.width + Math.floor(x)) * 4 + 3] / 255;
          if (alpha < 0.08) continue;
          const distance = Math.hypot(x - pointer.x, y - pointer.y);
          const lift = Math.max(0, 1 - distance / 95) * alpha;
          context.fillStyle = `rgb(${Math.round(38 + lift * 213)},${Math.round(30 + lift * 138)},${Math.round(22 + lift * 60)})`;
          context.beginPath();
          context.arc(x, y, Math.sqrt(alpha) * gap * 0.58, 0, Math.PI * 2);
          context.fill();
        }
      }
    };
    const move = event => {
      const rect = canvas.getBoundingClientRect();
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      draw();
    };
    const leave = () => { pointer = { x: -1000, y: -1000 }; draw(); };
    draw();
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerleave", leave);
    window.addEventListener("resize", draw);
    return () => {
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", leave);
      window.removeEventListener("resize", draw);
    };
  }, []);
  return <footer ref={rootRef} className="halftone-footer">
    <canvas ref={canvasRef} aria-hidden="true" />
    <div className="halftone-top">
      <div><Logo /><span>© 2026 · Context / Tone / Clarity</span></div>
      <div><small>Explore</small><button type="button" onClick={() => goSection(go, "features")}>Product</button><button type="button" onClick={() => goSection(go, "how")}>How it works</button><button type="button" onClick={() => goSection(go, "theory")}>The framework</button><button type="button" onClick={() => goSection(go, "extension")}>Browser extension</button><button type="button" onClick={() => goSection(go, "pricing")}>Pricing</button></div>
      <div><small>Connect</small><a href="mailto:arsalanahmeda813@gmail.com">arsalanahmeda813@gmail.com</a><button type="button" onClick={() => go("contact")}>Contact</button><a href="https://www.linkedin.com/in/arsalan-ahmed-khan-b4a9a2310" target="_blank" rel="noreferrer">LinkedIn</a><a href="https://github.com/arsalanahmedk" target="_blank" rel="noreferrer">GitHub</a></div>
      <div><small>Studio</small><span>Made for messages that matter.</span><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Back to top ↑</button></div>
    </div>
    <div className="halftone-rule"><span>saylient.ai / communication studio</span><span>Keep the intent. Change the impact.</span></div>
  </footer>;
}

/* ------------------------------------------------------------------ landing */

/* The Analyzer console — the hero of the landing and the shape of the
   Assistant page. Left: a textarea for the visitor's own message, sample
   chips, and a large Analyze button. Right: the results — intent, tone and
   strategy chips with scores, plus the draft reply panel with Copy /
   Regenerate / Use in extension. Signed-in visitors get a LIVE analysis
   of the text they typed; visitors see the clearly-labelled precomputed
   demo for the selected sample. */
function HeroAnalysisWindow({ go, user }) {
  const [preset, setPreset] = useState(0);
  const [typed, setTyped] = useState(DEMO_PRESETS[0].message);
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  // Bumps every time a run finishes, so the output block remounts
  // and visibly re-renders for the currently selected scenario.
  const [demoTick, setDemoTick] = useState(0);
  const demoTimerRef = useRef(null);
  const chosen = DEMO_PRESETS[preset];
  const isCustom = typed.trim() !== chosen.message;

  useEffect(() => () => { if (demoTimerRef.current) clearTimeout(demoTimerRef.current); }, []);

  const pickPreset = (i) => { setPreset(i); setTyped(DEMO_PRESETS[i].message); setLive(null); setError(""); };

  const run = async () => {
    if (user) {
      if (!typed.trim() || typed.length > 2000 || running) return;
      setRunning(true); setError(""); setLive(null);
      try {
        const result = await api.createAnalysis({
          message: typed.trim(),
          conversation_context: [],
          goal: GOAL_VALUES[chosen.goal],
          context: { power: "unknown", social_distance: "unknown", imposition: "unknown" },
        });
        setLive(result);
        setDemoTick(t => t + 1);
      } catch (err) { setError(friendlyError(err)); }
      setRunning(false);
      return;
    }
    setRunning(true); setError("");
    demoTimerRef.current = setTimeout(() => {
      setRunning(false);
      setDemoTick(t => t + 1);
    }, 700);
  };

  const copyDraft = async () => {
    const draft = (live || chosen.result).draft;
    await navigator.clipboard?.writeText(draft);
    setCopied(true); setTimeout(() => setCopied(false), 1400);
  };

  const shown = live || (!user ? chosen.result : null);
  const isDemo = !live && !user;
  return <div className="analyzer-console">
    <div className="console-toolbar"><span className="window-dots"><i /><i /><i /></span><strong>Saylient Analyzer</strong><span className="console-badge">{user ? "Live analysis" : "Precomputed demo · prototype-0.1"}</span></div>
    <div className="analyzer-grid">
      <div className="analyzer-form">
        <label>Your client's message<textarea value={typed} onChange={e => setTyped(e.target.value)} placeholder="Paste your client's message…" maxLength={2000} rows={6} /></label>
        <div className="sample-chips"><span>Try a sample:</span>{DEMO_PRESETS.map((p, i) => <button key={p.label} type="button" className={preset === i ? "active" : ""} onClick={() => pickPreset(i)}>{p.label}</button>)}</div>
        <Button onClick={run} icon={running ? LoaderCircle : WandSparkles} disabled={running || (user && !typed.trim())}>{running ? "Analyzing…" : user ? "Analyze message" : "Run demo analysis"}</Button>
        {!user && isCustom && <p className="console-hint">Sign in to analyze your own message — the demo below is for the selected sample.</p>}
        {user && <p className="console-hint">Live analysis · your account</p>}
        {error && <div className="form-error">{error}</div>}
      </div>
      <div className="analyzer-results">
        {running && <div className="hero-output hero-output-loading" aria-live="polite"><div className="hero-shimmer"><i /><i /><i /></div><span><LoaderCircle size={14} className="spin" /> {user ? "Analyzing…" : "Running demo analysis…"}</span></div>}
        {!running && shown && <div className="hero-output" key={demoTick}>
          <div className="hero-output-head">
            <span className="ai-icon"><Sparkles size={14} /></span>
            <strong>{isDemo ? "Demo output" : "Live analysis"} · {shown.model_version}</strong>
            <span className="result-tag"><Check size={12} /> Review required</span>
          </div>
          <div className="hero-output-tags">
            <span><b>Intent</b> {prettyLabel(shown.intent?.label)} · {Math.round((shown.intent?.confidence || 0) * 100)}% <small>({CONFIDENCE_NOTE})</small></span>
            <span><b>Tone</b> {prettyLabel(shown.tone?.label)}</span>
            <span><b>Strategy</b> {prettyLabel(shown.strategy?.label)}</span>
          </div>
          <p className="hero-draft">{shown.draft}</p>
          <div className="analyzer-actions">
            <button className="secondary-action" onClick={copyDraft}><Copy size={14} /> {copied ? "Copied" : "Copy draft"}</button>
            <button className="secondary-action" onClick={run} disabled={running}><RotateCw size={14} /> Regenerate</button>
            <button className="secondary-action" onClick={() => go("extension")}><Globe2 size={14} /> Use in extension</button>
          </div>
          {isDemo && <button className="link-button" onClick={() => go("login")}>Sign in to analyze your own messages <ArrowRight size={13} /></button>}
        </div>}
        {!shown && !running && <div className="analyzer-empty"><div className="empty-spark"><Sparkles size={25} /></div><h3>Your analysis appears here.</h3><p>Paste a message and run the analyzer — intent, tone, strategy and a draft you can edit.</p></div>}
      </div>
    </div>
  </div>;
}

/* Integrations marquee: the extension works on
   any HTTPS page, so the strip names the places people actually write. */
const MARQUEE_ITEMS = ["Browser extension", "Gmail", "Upwork", "Fiverr", "LinkedIn", "Slack", "WhatsApp Web", "Google Docs"];

function Marquee() {
  const items = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  return <div className="marquee" aria-label="Works wherever you write">
    <span className="marquee-label">Works wherever you write</span>
    <div className="marquee-viewport">
    <div className="marquee-track">
      {items.map((item, i) => <span className="marquee-item" key={`${item}-${i}`} aria-hidden={i >= MARQUEE_ITEMS.length}>{item}</span>)}
    </div>
    </div>
  </div>;
}

/* Shared public navigation (landing + contact page). Section links route
   through goSection, not #hash anchors, so the hash router cannot mistake
   them for page names. */
function PublicNav({ go, user }) {
  return <nav className="landing-nav" aria-label="Primary navigation">
    <Logo />
    <div className="landing-nav-links"><button type="button" onClick={() => goSection(go, "features")}>Product</button><button type="button" onClick={() => goSection(go, "how")}>How it works</button><button type="button" onClick={() => goSection(go, "theory")}>Framework</button><button type="button" onClick={() => goSection(go, "extension")}>Extension</button><button type="button" onClick={() => go("contact")}>Contact</button></div>
    {user ? <button className="nav-user" onClick={() => go("overview")}>{user.display_name || user.email} · Workspace</button> : <Button onClick={() => go("login")}>Sign in</Button>}
  </nav>;
}

function Landing({ go, user }) {
  const reduce = useReducedMotion();
  const fadeUp = (delay) => ({
    initial: reduce ? false : { opacity: 0, y: 26 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.65, delay, ease: "easeOut" },
  });
  const strategies = [
    ["Bald on Record", "Direct and clear. Best when the message is urgent, the relationship is close, or the imposition is low."],
    ["Positive Politeness", "Shows appreciation and shared ground. Best when you want the other person to feel valued and included."],
    ["Negative Politeness", "Hedges and respects autonomy. Best when the imposition is high or the relationship is distant."],
    ["Off Record", "Hints instead of asking directly. Best when the risk of a direct request is too high."],
    ["Avoidance", "Says nothing, or delays. Sometimes the kindest and safest move."],
  ];
  return <div className="landing">
    <PublicNav go={go} user={user} />
    <main>
      <section className="hero shell">
        <div className="hero-dots" aria-hidden="true" />
        <motion.div className="hero-badge" {...fadeUp(0)}><span className="pulse-dot" /> AI-based freelancer communication assistant</motion.div>
        <motion.h1 {...fadeUp(0.08)}>Say it so <em>they say yes.</em></motion.h1>
        <motion.p {...fadeUp(0.16)}>Saylient AI reads the intent, tone and face concerns behind a message — and drafts a reply that still sounds like you.</motion.p>
        <motion.div className="hero-console" {...fadeUp(0.26)}>
          <HeroAnalysisWindow go={go} user={user} />
          <div className="hero-tone">
            <div className="hero-tone-head"><span>Refine the tone</span><p>Tap an underlined phrase, then pick a tone — the drafts are real engine output.</p></div>
            <PhraseRewriteDemo go={go} user={user} />
          </div>
        </motion.div>
        <motion.div className="hero-note" {...fadeUp(0.36)}><ShieldCheck size={14} /> Nothing is ever sent automatically. You always review before you send.</motion.div>
      </section>

      <Marquee />

      <HowItWorks go={go} />

      <FeatureTabs go={go} user={user} />

      {user && <DashboardPreview go={go} />}

      <section id="theory" className="theory-strip shell">
        <div className="center-heading"><div className="eyebrow">Grounded in research</div><h2>The science of <em>being understood.</em></h2><p>Built on Brown and Levinson's Politeness Theory (1987) — five strategies, one reason each.</p></div>
        <div className="strategy-strip">
          {strategies.map(([title, text], i) => <motion.article className="strategy-chip" key={title} initial={reduce ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay: i * 0.07, ease: "easeOut" }}><span>{String(i + 1).padStart(2, "0")}</span><strong>{title}</strong><p>{text}</p></motion.article>)}
        </div>
        <div className="center-heading" style={{ marginTop: 28 }}><Button variant="outline" onClick={() => go("theory")}>Explore politeness theory <ArrowRight size={15} /></Button></div>
      </section>

      <motion.section id="extension" className="extension-cta shell" initial={reduce ? false : { opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6, ease: "easeOut" }}>
        <div className="extension-head">
          <div className="browser-icon"><Globe2 size={26} /></div>
          <div><div className="eyebrow">In your browser</div><h2>Good communication,<br /><em>wherever work happens.</em></h2></div>
        </div>
        <div className="extension-grid">
          <BeamDiagram />
          <div className="extension-copy"><p>Click the ✦ button on any page, sign in once, and get a live analysis of the text on your screen — intent, strategy, and a draft you can insert. Nothing is monitored or sent on its own.</p>
            <div className="extension-actions">
              <a className="button" href="/saylient-extension.zip" download><Download size={15} /><span>Download extension</span></a>
              <Button variant="outline" onClick={() => go("extension")}>Learn about the extension <ArrowRight size={15} /></Button>
            </div>
            <ol className="download-steps"><li>Download and unzip the file.</li><li>Open <code>chrome://extensions</code> and turn on Developer mode.</li><li>Choose <strong>Load unpacked</strong> and select the unzipped folder.</li></ol>
          </div>
        </div>
      </motion.section>

      <PricingSection go={go} />

      <section className="closing-cta shell">
        <motion.div className="closing-card" initial={reduce ? false : { opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6, ease: "easeOut" }}>
          <div className="eyebrow">Ready when you are</div>
          <h2>Your next message <em>starts here.</em></h2>
          <p>One analysis is all it takes to stop second-guessing the send button.</p>
          <Button onClick={() => go("assistant")} icon={WandSparkles}>Open the assistant</Button>
        </motion.div>
      </section>
    </main>
    <HalftoneFooter go={go} />
  </div>;
}

/* ------------------------------------------------------------------ workspace shell */

function Layout({ page, go, user, onSignOut, children }) {
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return <div className="app-shell"><aside className={`sidebar${mobile ? " open" : ""}${collapsed ? " collapsed" : ""}`}><div className="side-logo"><Logo /><button className="collapse-toggle" onClick={() => setCollapsed(c => !c)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}</button><button className="mobile-close" onClick={() => setMobile(false)}><X size={18} /></button></div><div className="side-label">Workspace</div><nav>{navItems.map(([id, label, Icon]) => <button key={id} className={page === id ? "side-link active" : "side-link"} onClick={() => { go(id); setMobile(false); }} title={label}><Icon size={17} /><span className="side-link-label">{label}</span>{id === "assistant" && <span className="new-dot" />}</button>)}</nav><div className="side-label lower">Account</div><button className={`side-link ${page === "settings" ? "active" : ""}`} onClick={() => go("settings")} title="Settings"><Settings size={17} /><span className="side-link-label">Settings</span></button><button className="side-link" onClick={onSignOut} title="Sign out"><LogOut size={17} /><span className="side-link-label">Sign out</span></button><div className="upgrade-card"><Sparkles size={17} /><strong>Prototype build</strong><p>Analyses run on the rule-based engine (prototype-0.1). Your data lives in your account.</p><button onClick={() => go("assistant")}>Analyze a message <ArrowRight size={13} /></button></div><button className="profile profile-button" onClick={() => go("profile")}><div className="profile-avatar">{initials(user.display_name || user.email)}</div><div className="profile-text"><strong>{user.display_name || user.email}</strong><small>{user.email}</small></div><MoreHorizontal size={16} /></button></aside><div className="main-area"><header className="app-header"><button className="menu-button" onClick={() => setMobile(true)}><Menu size={20} /></button><div className="breadcrumb"><span>Workspace</span><ChevronDown size={14} /><strong>{navItems.find(x => x[0] === page)?.[1] || "Overview"}</strong></div><div className="header-actions"><button aria-label="Help" onClick={() => go("theory")}><CircleHelp size={18} /></button><button className="header-avatar" onClick={() => go("profile")}>{initials(user.display_name || user.email)}</button></div></header><main className="dashboard-content">{children}</main></div></div>;
}

function PageHeader({ eyebrow, title, text, children }) { return <div className="page-header"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{text && <p>{text}</p>}</div>{children}</div>; }

/* ------------------------------------------------------------------ dashboard */

function Dashboard({ go, user, onOpen }) {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getStats(), api.listAnalyses(5, 0)])
      .then(([s, a]) => { if (!cancelled) { setStats(s); setRecent(a.items || []); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(friendlyError(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);
  const firstName = (user?.display_name || user?.email || "there").split(" ")[0];
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const buckets = stats?.buckets_30d || [0, 0, 0, 0, 0];
  const maxBucket = Math.max(1, ...buckets);
  // Y-axis ticks must be unique integers: with maxBucket 1 the naive
  // [max, ceil(max/2), 0] renders "1, 1, 0".
  const yTicks = [...new Set([maxBucket, Math.ceil(maxBucket / 2), 0])];
  const points = buckets.map((v, i) => [i * 150, 160 - (v / maxBucket) * 140]);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const area = `${line} L600 170 L0 170 Z`;
  const avgConf = stats?.avg_intent_confidence == null ? null : Math.round(stats.avg_intent_confidence * 100);
  return <>
    <PageHeader eyebrow={today} title={<>Good to see you, {firstName} <span className="wave">✦</span></>} text="Your real communication overview — data comes from your account, not a demo."><Button onClick={() => go("assistant")} icon={Plus}>New analysis</Button></PageHeader>
    {error && <div className="form-error panel">{error}</div>}
    {loading ? <div className="panel placeholder-page"><div className="placeholder-icon"><Sparkles size={25} /></div><h2>Loading your overview…</h2></div> : <>
      <div className="stats-grid">
        <Stat title="Messages analyzed" value={stats?.total ?? 0} change={`${stats?.this_week ?? 0} this week`} icon={MessageSquare} color="accent" />
        <Stat title="Avg. intent confidence" value={avgConf === null ? "—" : `${avgConf}%`} change={CONFIDENCE_NOTE} icon={Gauge} color="black" />
        <Stat title="Flagged face concerns" value={stats?.fta_count ?? 0} change={stats?.total ? `${Math.round((stats.fta_count / stats.total) * 100)}% of messages` : "No analyses yet"} icon={Clock3} color="slate" />
        <Stat title="Most common intent" value={stats?.top_intent ? prettyLabel(stats.top_intent) : "—"} change={stats?.top_strategy ? `Usual strategy: ${prettyLabel(stats.top_strategy)}` : "No analyses yet"} icon={Target} color="grey" />
      </div>
      <div className="dashboard-grid">
        <section className="panel activity-panel"><div className="panel-heading"><div><h3>Communication activity</h3><p>Your analyses over the last 30 days</p></div><span className="live-pill"><span className="pulse-dot" /> Live · your data</span></div>
          <div className="fake-chart"><div className="chart-y">{yTicks.map(t => <span key={t}>{t}</span>)}</div><div className="chart-area"><div className="grid-lines"><i /><i /><i /><i /><i /></div>
            <svg viewBox="0 0 600 170" preserveAspectRatio="none"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style={{ stopColor: "var(--accent)" }} stopOpacity=".3" /><stop offset="1" style={{ stopColor: "var(--accent)" }} stopOpacity="0" /></linearGradient></defs>
              {(stats?.total || 0) > 0 ? <><path d={area} fill="url(#chartFill)" /><path d={line} fill="none" style={{ stroke: "var(--accent)" }} strokeWidth="3" /></> : <text x="300" y="85" textAnchor="middle" style={{ fill: "var(--text-2)" }} fontSize="13">No analyses yet — try the assistant.</text>}
            </svg><div className="chart-x"><span>30 days ago</span><span>24 days</span><span>18 days</span><span>12 days</span><span>Today</span></div></div></div>
        </section>
        <section className="panel insights-panel"><div className="panel-heading"><div><h3>Recent AI insights</h3><p>From your actual analyses</p></div></div>
          {(stats?.total || 0) > 0 ? <>
            {stats.top_intent && <Insight icon={Target} title={`Most often: ${prettyLabel(stats.top_intent)}`} text="Your most common intent across all analyses." />}
            {stats.top_strategy && <Insight icon={Lightbulb} title={`Usual strategy: ${prettyLabel(stats.top_strategy)}`} text="The strategy the engine recommends most for you." />}
            <Insight icon={Zap} title={stats.fta_count ? `${stats.fta_count} message${stats.fta_count === 1 ? "" : "s"} flagged a face concern` : "No face concerns flagged"} text={stats.fta_count ? "Review the breakdown before you send." : "Keep it up — or analyze a trickier message."} />
          </> : <Insight icon={Lightbulb} title="Nothing analyzed yet" text="Analyze a message and your patterns will show up here." />}
        </section>
      </div>
      <section className="panel recent-panel"><div className="panel-heading"><div><h3>Recent conversations</h3><p>Your latest analyses</p></div><button className="link-button" onClick={() => go("history")}>View all <ArrowRight size={14} /></button></div>
        {recent.length ? <div className="conversation-table">{recent.map(c => <div className="conversation-row" key={c.id}><div className="conversation-icon"><MessageSquare size={16} /></div><div className="conversation-name"><strong>{prettyLabel(c.intent?.label)}</strong><span>{c.message}</span></div><span className="conversation-date">{new Date(c.created_at).toLocaleDateString()}</span><div className="score-pill"><span /> {Math.round((c.intent?.confidence || 0) * 100)}%</div><button className="icon-button" onClick={() => onOpen(c)} aria-label="Open in assistant"><ArrowRight size={16} /></button></div>)}</div> : <div className="placeholder-page"><div className="placeholder-icon"><History size={25} /></div><h2>No analyses yet.</h2><p>Your first analysis will appear here.</p><Button onClick={() => go("assistant")} icon={Sparkles}>Analyze a message</Button></div>}
      </section></>}
  </>;
}
function Stat({ title, value, change, icon: Icon, color }) {
  return <div className="stat-card"><div className={`stat-icon ${color}`}><Icon size={18} /></div><div className="stat-value">{typeof value === "number" ? <CountUp value={value} /> : value}</div><div className="stat-title">{title}</div><div className="stat-change"><span>↗</span> {change}</div></div>;
}
function Insight({ icon: Icon, title, text }) { return <div className="insight"><div className="insight-icon"><Icon size={16} /></div><div><strong>{title}</strong><p>{text}</p></div></div>; }

/* ------------------------------------------------------------------ assistant */

function Assistant({ go, openAnalysis, clearOpen }) {
  const [message, setMessage] = useState("Hey, I need the final files today. This is taking longer than expected.");
  const [contextItems, setContextItems] = useState([{ role: "client", text: "" }]);
  const [goal, setGoal] = useState("Set a boundary");
  const [power, setPower] = useState("unknown");
  const [distance, setDistance] = useState("unknown");
  const [imposition, setImposition] = useState("unknown");
  const [tone, setTone] = useState("Diplomatic");
  const [directness, setDirectness] = useState("balanced");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [log, setLog] = useState([]);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [draftId, setDraftId] = useState(null);
  const [savedNote, setSavedNote] = useState("");
  const [updating, setUpdating] = useState(false);
  const timerRef = useRef(null);
  const messageRef = useRef(null);

  useEffect(() => {
    if (!openAnalysis) return;
    setAnalysis(openAnalysis);
    setMessage(openAnalysis.message || "");
    setGoal(GOAL_LABELS[openAnalysis.goal] || "Set a boundary");
    const cf = openAnalysis.context_factors || {};
    setPower(cf.power || "unknown");
    setDistance(cf.social_distance || "unknown");
    setImposition(cf.imposition || "unknown");
    const ctx = (openAnalysis.conversation_context || []).map(c => ({ role: c.role === "freelancer" ? "freelancer" : "client", text: c.text }));
    setContextItems(ctx.length ? ctx : [{ role: "client", text: "" }]);
    setDraftId(null); setSavedNote(""); setError(""); setStage(5);
    setLog(["Loaded a saved analysis — review the draft below."]);
    api.listDrafts(openAnalysis.id).then(d => {
      const latest = (d.items || [])[0];
      if (latest) setDraftId(latest.id);
    }).catch(() => {});
    clearOpen();
  }, [openAnalysis]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const autoResize = () => {
    const el = messageRef.current;
    if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 320)}px`; }
  };
  useEffect(autoResize, [message]);

  const startPipeline = () => {
    setStage(0);
    setLog([PIPELINE_STAGES[0].log]);
    let s = 0;
    timerRef.current = setInterval(() => {
      s += 1;
      if (s > 4) { clearInterval(timerRef.current); return; }
      setStage(s);
      setLog(prev => [...prev, PIPELINE_STAGES[s].log]);
    }, 450);
  };
  const stopPipeline = (done) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setStage(done ? 5 : 0);
    if (done) setLog(prev => [...prev, "Done — review the draft below."]);
  };

  const analyze = async () => {
    if (!message.trim() || message.length > 2000 || loading) return;
    setLoading(true); setError(""); setSavedNote("");
    startPipeline();
    try {
      const result = await api.createAnalysis({
        message: message.trim(),
        conversation_context: contextItems.filter(c => c.text.trim()).map(c => ({ role: c.role, text: c.text.trim() })),
        goal: GOAL_VALUES[goal],
        context: { power, social_distance: distance, imposition },
        tone,
        directness,
      });
      stopPipeline(true);
      setAnalysis(result); setDraftId(null);
    } catch (err) {
      stopPipeline(false);
      setError(friendlyError(err));
      setLog(prev => [...prev, "The analysis could not run — see the error above."]);
    }
    setLoading(false);
  };

  const regenerate = async (nextTone, nextDirectness) => {
    if (!analysis || loading || updating) return;
    setUpdating(true); setError("");
    try {
      const result = await api.regenerateAnalysis(analysis.id, { tone: nextTone ?? tone, directness: nextDirectness ?? directness });
      setAnalysis(result); setDraftId(null); setSavedNote("");
    } catch (err) { setError(friendlyError(err)); }
    setUpdating(false);
  };

  const changeTone = (t) => { setTone(t); if (analysis) regenerate(t, undefined); };
  const changeDirectness = (d) => { setDirectness(d); if (analysis) regenerate(undefined, d); };

  const saveDraft = async (draftText) => {
    if (!analysis) return;
    try {
      if (draftId) {
        await api.patchDraft(draftId, { draft_text: draftText, tone_setting: tone, directness_setting: directness });
      } else {
        const created = await api.createDraft(analysis.id, { draft_text: draftText, tone_setting: tone, directness_setting: directness });
        setDraftId(created.id);
      }
      setSavedNote("Draft saved to this analysis.");
    } catch (err) { setError(friendlyError(err)); }
  };
  const deleteDraft = async () => {
    if (!draftId) return;
    if (!window.confirm("Delete this saved draft? The analysis itself stays.")) return;
    try {
      await api.deleteDraft(draftId);
      setDraftId(null); setSavedNote("Draft deleted.");
    } catch (err) { setError(friendlyError(err)); }
  };

  return <><PageHeader eyebrow="Message assistant" title="Find the right words." text="Add a little context, and we'll help you say what you mean." />
    <div className="assistant-console">
      <div className="console-toolbar"><span className="window-dots"><i /><i /><i /></span><strong>Message assistant</strong><span className="console-badge">Live analysis · real backend</span></div>
      <div className="assistant-layout">
      <section className="panel assistant-form"><div className="assistant-title"><div className="panel-icon accent"><MessageSquare size={17} /></div><div><h3>Your message</h3><p>Context is user supplied; predictions are labelled.</p></div></div>
        {error && <div className="form-error">{error}</div>}
        <div className="context-editor">
          <label>Conversation context <span>Optional — earlier messages, newest last</span></label>
          {contextItems.map((item, i) => <div className="context-row" key={i}>
            <select className="field select-field" value={item.role} onChange={e => setContextItems(contextItems.map((c, j) => j === i ? { ...c, role: e.target.value } : c))} aria-label="Who wrote this message">
              <option value="client">Client</option>
              <option value="freelancer">Freelancer</option>
            </select>
            <input className="field" value={item.text} onChange={e => setContextItems(contextItems.map((c, j) => j === i ? { ...c, text: e.target.value } : c))} placeholder="An earlier message in this conversation…" maxLength={2000} />
            <button className="icon-button" onClick={() => setContextItems(contextItems.filter((_, j) => j !== i))} aria-label="Remove this message" disabled={contextItems.length === 1}><X size={15} /></button>
          </div>)}
          <button className="link-button" onClick={() => setContextItems([...contextItems, { role: "client", text: "" }])}><Plus size={13} /> Add another message</button>
        </div>
        <label>Communication goal <span>Pick the one that fits</span>
          <div className="goal-pills">{GOAL_OPTIONS.map(item => <button key={item} className={goal === item ? "selected" : ""} onClick={() => setGoal(item)} aria-pressed={goal === item}>{item}</button>)}</div>
        </label>
        <div className="field-row three"><label>Power<select className="field select-field" value={power} onChange={e => setPower(e.target.value)}>{PDR_OPTIONS.map(v => <option key={v} value={v}>{v === "unknown" ? "Unknown" : prettyLabel(v)}</option>)}</select></label><label>Social distance<select className="field select-field" value={distance} onChange={e => setDistance(e.target.value)}>{PDR_OPTIONS.map(v => <option key={v} value={v}>{v === "unknown" ? "Unknown" : prettyLabel(v)}</option>)}</select></label><label>Imposition<select className="field select-field" value={imposition} onChange={e => setImposition(e.target.value)}>{PDR_OPTIONS.map(v => <option key={v} value={v}>{v === "unknown" ? "Unknown" : prettyLabel(v)}</option>)}</select></label></div>
        <label>Original message<textarea ref={messageRef} value={message} onChange={e => setMessage(e.target.value)} placeholder="Write the message you'd like help with..." /></label>
        <div className="unknown-note"><CircleHelp size={13} /> Power, distance and imposition stay unknown unless you set them — the engine will say so instead of guessing.</div>
        <div className="assistant-form-footer"><span className="char-count">{message.length}/2000</span><Button onClick={analyze} icon={loading ? LoaderCircle : Sparkles} disabled={loading}>{loading ? "Analyzing…" : "Analyze conversation"}</Button></div>
      </section>

      <section className="panel result-panel">
        {!analysis ? <div className="empty-result"><div className="empty-spark"><Sparkles size={25} /></div><h3>Your thoughtful response<br />starts here.</h3><p>We'll look at intent, tone, possible face concerns, and strategy without pretending to know the recipient's feelings.</p><div className="mini-points"><span><Check size={13} /> Context-aware</span><span><Check size={13} /> Review before sending</span></div></div> : <>
          <div className="pipeline-card">
            <div className="pipeline-nodes">
              {PIPELINE_STAGES.map((s, i) => <div key={s.name} className={`pipeline-node-item${stage > i ? " done" : ""}${stage === i && loading ? " active" : ""}`}>
                <span className="node-dot">{stage > i ? <Check size={11} /> : i + 1}</span><span className="node-name">{s.name}</span>
                {i < PIPELINE_STAGES.length - 1 && <span className="node-connector" />}
              </div>)}
            </div>
            <div className="pipeline-side">
              {loading ? <div className="pipeline-spinner"><LoaderCircle size={26} className="spin" /><span>Analyzing…</span></div> : <><ScoreRing value={analysis.intent?.confidence || 0} /><div className="ring-caption">{CONFIDENCE_NOTE}</div></>}
              <div className="pipeline-log" aria-live="polite">
                {log.map((line, i) => <div key={i} className="log-line"><span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>{line}</div>)}
              </div>
            </div>
          </div>
          <Result analysis={analysis} tone={tone} directness={directness} onTone={changeTone} onDirectness={changeDirectness} onSave={saveDraft} onDeleteDraft={deleteDraft} hasDraft={!!draftId} onRegenerate={() => regenerate()} savedNote={savedNote} updating={updating} />
        </>}
      </section>
      </div>
    </div></>;
}

function Result({ analysis, tone, directness, onTone, onDirectness, onSave, onDeleteDraft, hasDraft, onRegenerate, savedNote, updating }) {
  const [draft, setDraft] = useState(analysis.draft);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(analysis.draft); }, [analysis.id, analysis.draft]);
  const copy = async () => { await navigator.clipboard?.writeText(draft); setCopied(true); setTimeout(() => setCopied(false), 1400); };
  const save = async () => { setSaving(true); await onSave(draft); setSaving(false); };
  const faceLabels = (analysis.face_concern || []).map(f => f === "positive_face" ? "Positive face" : f === "negative_face" ? "Negative face" : prettyLabel(f));
  const cf = analysis.context_factors || {};
  const pdr = (v) => v === "unknown" ? "Unknown" : prettyLabel(v);
  return <div className="result-content">
    <div className="result-top"><div><div className="result-kicker"><span className="ai-icon"><Sparkles size={14} /></span> Live analysis · {analysis.model_version}</div><h3>A clearer way to say it</h3></div><span className="result-tag"><Check size={12} /> Review required</span></div>
    <div className="original-message"><small>ORIGINAL MESSAGE</small><p>“{analysis.message}”</p></div>
    <div className="result-cards">
      <div className="result-card"><small>Intent</small><strong>{prettyLabel(analysis.intent?.label)}</strong><span>{Math.round((analysis.intent?.confidence || 0) * 100)}% · {CONFIDENCE_NOTE}</span></div>
      <div className="result-card"><small>Tone</small><strong>{prettyLabel(analysis.tone?.label)}</strong><span>{Math.round((analysis.tone?.confidence || 0) * 100)}% · {CONFIDENCE_NOTE}</span></div>
      <div className="result-card"><small>Strategy</small><strong>{prettyLabel(analysis.strategy?.label)}</strong><span>{analysis.fta?.detected ? analysis.fta.description : "No face-threatening act detected"}</span></div>
    </div>
    <div className="analysis-breakdown"><div><small>Face concerns</small><p>{faceLabels.length ? faceLabels.join(" · ") : "None flagged."}</p></div><div><small>P / D / R</small><p>Power: {pdr(cf.power)} · Distance: {pdr(cf.social_distance)} · Imposition: {pdr(cf.imposition)}</p></div></div>
    <div className="strategy-card"><span>Recommended strategy</span><strong>{prettyLabel(analysis.strategy?.label)}</strong><p>{analysis.strategy?.rationale}</p></div>
    <div className="response-card"><div className="response-card-head"><span>Editable suggested response</span><button onClick={copy}><Copy size={14} /> {copied ? "Copied" : "Copy"}</button></div><textarea className="draft-editor" value={draft} onChange={e => setDraft(e.target.value)} /><div className="response-note"><Lightbulb size={14} /><span>{(analysis.limitations || []).join(" ")}</span></div></div>
    <div className="tone-section"><span>Response tone</span><div className="tone-options">{TONE_OPTIONS.map(t => <button className={tone === t ? "active" : ""} onClick={() => onTone(t)} key={t} aria-pressed={tone === t}>{t}</button>)}</div></div>
    <div className="tone-section"><span>Directness</span><div className="tone-options">{DIRECTNESS_OPTIONS.map(d => <button className={directness === d.value ? "active" : ""} onClick={() => onDirectness(d.value)} key={d.value} aria-pressed={directness === d.value}>{d.label}</button>)}</div><p className="tone-hint">Changing tone or directness re-runs the analysis with the new styling.</p></div>
    <div className="result-actions">
      <button className="secondary-action" onClick={() => setDraft(analysis.draft)}><RotateCw size={15} /> Reset draft</button>
      {hasDraft && <button className="secondary-action" onClick={onDeleteDraft}><Trash2 size={15} /> Delete draft</button>}
      <button className="secondary-action" onClick={save} disabled={saving}><History size={15} /> {saving ? "Saving…" : "Save draft"}</button>
      <Button onClick={onRegenerate} icon={WandSparkles} disabled={updating}>{updating ? "Updating…" : "Regenerate"}</Button>
    </div>
    {savedNote && <div className="form-note">{savedNote}</div>}
    <small className="model-note">Model: {analysis.model_version} · No message is sent automatically.</small>
  </div>;
}

/* ------------------------------------------------------------------ other pages */

const STARTERS = [
  { title: "Payment reminder", category: "Payment", text: "Hi Alex, I wanted to follow up on the outstanding invoice and check whether you have an expected payment date." },
  { title: "Scope boundary", category: "Work boundaries", text: "I can help with that change. To keep the current deadline, it would be best to treat it as a new scope item." },
  { title: "Deadline negotiation", category: "Deadline", text: "Would moving the delivery to Thursday work for you? That would give me enough time to keep the quality where it needs to be." },
];

function SimplePage({ type, go, user, onSignOut, onOpen, onUserChanged }) {
  if (type === "analysis") return <AnalysisPage go={go} onOpen={onOpen} />;
  if (type === "history") return <HistoryPage go={go} onOpen={onOpen} />;
  if (type === "templates") return <TemplatesPage go={go} />;
  if (type === "theory") return <TheoryPage go={go} />;
  if (type === "settings") return <SettingsPage user={user} go={go} onSignOut={onSignOut} />;
  if (type === "profile") return <ProfilePage user={user} go={go} onSignOut={onSignOut} onUserChanged={onUserChanged} />;
  if (type === "extension") return <ExtensionPage go={go} />;
  return <AnalysisPage go={go} onOpen={onOpen} />;
}

function AnalysisPage({ go, onOpen }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.listAnalyses(10, 0)
      .then(d => { setItems(d.items || []); setLoading(false); })
      .catch(e => { setError(friendlyError(e)); setLoading(false); });
  }, []);
  return <><PageHeader eyebrow="Workspace" title="Communication analysis" text="Intent, tone, face concerns and strategy — for your latest messages."><Button onClick={() => go("assistant")} icon={Plus}>New analysis</Button></PageHeader>
    {error && <div className="form-error panel">{error}</div>}
    {loading ? <div className="panel placeholder-page"><div className="placeholder-icon"><BarChart3 size={25} /></div><h2>Loading your analyses…</h2></div> : items.length ? <div className="history-list">{items.map(item => <article className="panel history-item" key={item.id}><div><small>{prettyLabel(item.goal)} · {new Date(item.created_at).toLocaleDateString()}</small><h3>{item.message}</h3><div className="analysis-tags"><span><b>Intent</b> {prettyLabel(item.intent?.label)} · {Math.round((item.intent?.confidence || 0) * 100)}% <small>({CONFIDENCE_NOTE})</small></span><span><b>Tone</b> {prettyLabel(item.tone?.label)}</span><span><b>Strategy</b> {prettyLabel(item.strategy?.label)}</span><span>{item.fta?.detected ? "Face concern flagged" : "No face concern"}</span></div></div><button className="secondary-action" onClick={() => onOpen(item)}><ArrowRight size={15} /> Open</button></article>)}</div> : <div className="placeholder-page panel"><div className="placeholder-icon"><BarChart3 size={25} /></div><h2>Nothing analyzed yet.</h2><p>Analyze a message and its breakdown will appear here.</p><Button onClick={() => go("assistant")} icon={Sparkles}>Analyze a message</Button></div>}
  </>;
}

function HistoryPage({ go, onOpen }) {
  const PAGE = 10;
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const load = (nextOffset) => {
    if (nextOffset === 0) setLoading(true); else setLoadingMore(true);
    api.listAnalyses(PAGE, nextOffset)
      .then(d => {
        setItems(prev => nextOffset === 0 ? (d.items || []) : [...prev, ...(d.items || [])]);
        setTotal(d.total || 0); setOffset(nextOffset);
        setLoading(false); setLoadingMore(false);
      })
      .catch(e => { setError(friendlyError(e)); setLoading(false); setLoadingMore(false); });
  };
  useEffect(() => { load(0); }, []);
  const remove = async (id) => {
    if (!window.confirm("Delete this saved analysis?")) return;
    try { await api.deleteAnalysis(id); setItems(items.filter(item => item.id !== id)); setTotal(total - 1); }
    catch (e) { setError(friendlyError(e)); }
  };
  const filtered = items.filter(item => `${item.message} ${item.intent?.label || ""} ${item.strategy?.label || ""}`.toLowerCase().includes(query.toLowerCase()));
  const hasMore = items.length < total;
  return <><PageHeader eyebrow="Your private archive" title="Conversation history" text="Analyses are stored in your account. Deleting one removes it for good."><Button onClick={() => go("assistant")} icon={Plus}>New analysis</Button></PageHeader>
    {error && <div className="form-error panel">{error}</div>}
    <div className="history-toolbar panel"><Search size={16} /><input placeholder="Search saved conversations..." value={query} onChange={event => setQuery(event.target.value)} /><span>{total} saved</span></div>
    {loading ? <div className="placeholder-page panel"><div className="placeholder-icon"><History size={25} /></div><h2>Loading your history…</h2></div> : filtered.length ? <>
      <div className="panel history-table-wrap">
        <table className="history-table">
          <thead><tr><th>Client message</th><th>Intent</th><th>Tone</th><th>Politeness</th><th>Draft</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{filtered.map(item => <tr key={item.id}>
            <td className="history-message"><strong>{item.message}</strong><small>{new Date(item.created_at).toLocaleDateString()}</small></td>
            <td>{prettyLabel(item.intent?.label)} · {Math.round((item.intent?.confidence || 0) * 100)}%</td>
            <td>{prettyLabel(item.tone?.label)}</td>
            <td>{prettyLabel(item.strategy?.label)}</td>
            <td>{item.draft ? <span className="draft-chip">Draft ready</span> : <span className="muted">No draft</span>}</td>
            <td><div className="row-actions"><button className="secondary-action" onClick={() => onOpen(item)}><ArrowRight size={15} /> Open</button><button className="secondary-action" onClick={() => remove(item.id)}><Trash2 size={15} /> Delete</button></div></td>
          </tr>)}</tbody>
        </table>
      </div>
      <section className="panel timeline-panel"><div className="panel-heading"><div><h3>Activity timeline</h3><p>Newest first</p></div></div>
        <ol className="activity-timeline">{filtered.slice(0, 10).map(item => <li key={item.id}><span className="timeline-dot" /><div><strong>{prettyLabel(item.intent?.label)} · {Math.round((item.intent?.confidence || 0) * 100)}%</strong><span>{item.message}</span><small>{new Date(item.created_at).toLocaleDateString()} · {prettyLabel(item.strategy?.label)}{item.fta?.detected ? " · Face concern flagged" : ""}</small></div></li>)}</ol>
      </section>
    </> : <div className="placeholder-page panel"><div className="placeholder-icon"><History size={25} /></div><h2>Your saved conversations will appear here.</h2><p>Analyze a message and it is saved to your account automatically.</p><Button onClick={() => go("assistant")} icon={Sparkles}>Analyze a message</Button></div>}
    {hasMore && <div className="load-more"><Button variant="outline" onClick={() => load(offset + PAGE)} disabled={loadingMore}>{loadingMore ? "Loading…" : `Load more (${total - items.length} left)`}</Button></div>}
  </>;
}

function TemplatesPage({ go }) {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: "", category: "", body: "" });
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", category: "", body: "" });
  const load = () => {
    api.listTemplates(50, 0)
      .then(d => { setItems(d.items || []); setLoading(false); })
      .catch(e => { setError(friendlyError(e)); setLoading(false); });
  };
  useEffect(load, []);
  const create = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return;
    try {
      const created = await api.createTemplate({ title: form.title.trim(), category: form.category.trim() || "General", body: form.body.trim() });
      setItems([created, ...items]); setForm({ title: "", category: "", body: "" });
    } catch (err) { setError(friendlyError(err)); }
  };
  const saveStarter = async (t) => {
    try {
      const created = await api.createTemplate({ title: t.title, category: t.category, body: t.text });
      setItems([created, ...items]);
    } catch (err) { setError(friendlyError(err)); }
  };
  const remove = async (id) => {
    if (!window.confirm("Delete this template?")) return;
    try { await api.deleteTemplate(id); setItems(items.filter(i => i.id !== id)); }
    catch (err) { setError(friendlyError(err)); }
  };
  const startEdit = (item) => { setEditing(item.id); setEditForm({ title: item.title, category: item.category, body: item.body }); };
  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      const updated = await api.patchTemplate(editing, { title: editForm.title.trim(), category: editForm.category.trim(), body: editForm.body.trim() });
      setItems(items.map(i => i.id === editing ? updated : i));
      setEditing(null);
    } catch (err) { setError(friendlyError(err)); }
  };
  const categories = ["All", ...new Set(items.map(i => i.category))];
  const filtered = items.filter(item => (category === "All" || item.category === category) && `${item.title} ${item.category} ${item.body}`.toLowerCase().includes(query.toLowerCase()));
  const savedTitles = new Set(items.map(i => i.title));
  return <><PageHeader eyebrow="Reusable language" title="Saved templates" text="Keep thoughtful starting points for the moments that matter."><Button onClick={() => go("assistant")} icon={Plus}>Create from assistant</Button></PageHeader>
    {error && <div className="form-error panel">{error}</div>}
    <div className="history-toolbar panel"><Search size={16} /><input placeholder="Search templates..." value={query} onChange={event => setQuery(event.target.value)} /><span>{filtered.length} templates</span></div>
    <div className="category-chips">{categories.map(c => <button key={c} className={category === c ? "active" : ""} onClick={() => setCategory(c)} aria-pressed={category === c}>{c}</button>)}</div>
    <form className="panel template-form" onSubmit={create}>
      <div className="field-row"><label>Title<input className="field select-field" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Payment reminder" maxLength={120} /></label><label>Category<input className="field select-field" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Payment" maxLength={60} /></label></div>
      <label>Template text<textarea className="context-textarea" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Write the template..." maxLength={2000} /></label>
      <Button type="submit" icon={Plus}>Save template</Button>
    </form>
    {loading ? <div className="placeholder-page panel"><div className="placeholder-icon"><Clipboard size={25} /></div><h2>Loading your templates…</h2></div> : <>
      <div className="template-grid">{filtered.map(item => editing === item.id ? <form className="panel template-item editing" key={item.id} onSubmit={saveEdit}>
        <label>Title<input className="field select-field" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} maxLength={120} /></label>
        <label>Category<input className="field select-field" value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })} maxLength={60} /></label>
        <label>Template text<textarea className="context-textarea" value={editForm.body} onChange={e => setEditForm({ ...editForm, body: e.target.value })} maxLength={2000} /></label>
        <div className="template-edit-actions"><Button type="submit" icon={Check}>Save changes</Button><button type="button" className="secondary-action" onClick={() => setEditing(null)}>Cancel</button></div>
      </form> : <article className="panel template-item" key={item.id}><div className="template-top"><span>{item.category}</span><button onClick={() => navigator.clipboard?.writeText(item.body)} aria-label="Copy template"><Copy size={15} /></button></div><h3>{item.title}</h3><p>{item.body}</p><div className="template-actions"><button className="link-button" onClick={() => startEdit(item)}><PenLine size={13} /> Edit</button><button className="link-button" onClick={() => remove(item.id)}>Delete <Trash2 size={14} /></button></div></article>)}</div>
      <div className="panel" style={{ marginTop: 15 }}><div className="panel-heading"><div><h3>Starter templates</h3><p>Save one to your account to make it yours.</p></div></div>
        <div className="template-grid" style={{ marginTop: 15 }}>{STARTERS.map(item => <article className="panel template-item" key={item.title}><div className="template-top"><span>{item.category}</span><button onClick={() => navigator.clipboard?.writeText(item.text)} aria-label="Copy template"><Copy size={15} /></button></div><h3>{item.title}</h3><p>{item.text}</p>{savedTitles.has(item.title) ? <span className="model-note">Saved to your account</span> : <button className="link-button" onClick={() => saveStarter(item)}>Save template <Plus size={14} /></button>}</article>)}</div></div>
    </>}
  </>;
}

function TheoryPage({ go }) {
  const strategies = [
    ["Bald on Record", "Direct and clear. Best when the message is urgent, the relationship is close, or the imposition is low."],
    ["Positive Politeness", "Shows appreciation and shared ground. Best when you want the other person to feel valued and included."],
    ["Negative Politeness", "Hedges and respects autonomy. Best when the imposition is high or the relationship is distant."],
    ["Off Record", "Hints instead of asking directly. Best when the risk of a direct request is too high."],
    ["Avoidance", "Says nothing, or delays. Sometimes the kindest and safest move."],
  ];
  return <><PageHeader eyebrow="Learn the framework" title="Politeness theory" text="The science of being understood — Brown and Levinson's Politeness Theory (1987)."><Button onClick={() => go("assistant")} icon={Sparkles}>Try it in the assistant</Button></PageHeader>
    <div className="template-grid" style={{ marginBottom: 15 }}>
      <article className="panel template-item"><div className="template-top"><span>01</span></div><h3>Positive face</h3><p>The desire to feel appreciated, valued and included.</p></article>
      <article className="panel template-item"><div className="template-top"><span>02</span></div><h3>Negative face</h3><p>The desire for autonomy — freedom from pressure and imposition.</p></article>
      <article className="panel template-item"><div className="template-top"><span>03</span></div><h3>Face-threatening acts</h3><p>Messages that can challenge either need — a request, a criticism, a deadline.</p></article>
    </div>
    <section className="panel"><div className="panel-heading"><div><h3>Five strategies</h3><p>Saylient AI recommends one of these for every message it analyzes.</p></div></div>
      <div className="history-list" style={{ marginTop: 15 }}>{strategies.map(([title, text]) => <article className="panel history-item" key={title}><div><h3>{title}</h3><p>{text}</p></div></article>)}</div>
      <p className="model-note" style={{ marginTop: 16 }}>Saylient AI never claims to know what the recipient truly feels. It looks at what the message does — and what it might do.</p></section></>;
}

function SettingsPage({ user, go, onSignOut }) {
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportDone, setExportDone] = useState("");
  const [password, setPassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const doExport = async () => {
    setExportBusy(true); setExportError(""); setExportDone("");
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "saylient-ai-export.json"; a.click();
      URL.revokeObjectURL(url);
      setExportDone("Your data was downloaded as saylient-ai-export.json.");
    } catch (e) { setExportError(friendlyError(e)); }
    setExportBusy(false);
  };
  const doDelete = async () => {
    try { await api.deleteAccount(password); onSignOut(); }
    catch (e) { setDeleteError(friendlyError(e)); }
  };
  return <><PageHeader eyebrow="Workspace" title="Settings" text="Make Saylient AI fit the way you work — and control your data."><Button onClick={() => go("assistant")} icon={Plus}>New analysis</Button></PageHeader>
    <div className="history-list">
      <section className="panel history-item"><div><small>Account</small><h3>{user.display_name || user.email}</h3><p>{user.email} · Member since {new Date(user.created_at).toLocaleDateString()} · Status: {user.status}</p></div><button className="secondary-action" onClick={() => go("profile")}><UserRound size={15} /> View profile</button></section>
      <section className="panel history-item"><div><small>Privacy · your data</small><h3>Export my data</h3><p>Downloads a JSON file with your profile, analyses, drafts and templates.</p>{exportError && <div className="form-error">{exportError}</div>}{exportDone && <div className="form-note">{exportDone}</div>}</div><button className="secondary-action" onClick={doExport} disabled={exportBusy}><Download size={15} /> {exportBusy ? "Preparing..." : "Download export"}</button></section>
      <section className="panel history-item"><div><small>Privacy · danger zone</small><h3>Delete my account</h3><p>This permanently deletes your account, analyses, drafts and templates. It cannot be undone.</p>{deleteError && <div className="form-error">{deleteError}</div>}</div>{confirmDelete ? <div style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="password" className="field select-field" value={password} onChange={e => setPassword(e.target.value)} placeholder="Confirm your password" /><button className="secondary-action" onClick={doDelete}><Trash2 size={15} /> Delete forever</button><button className="secondary-action" onClick={() => { setConfirmDelete(false); setPassword(""); }}>Cancel</button></div> : <button className="secondary-action" onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Delete account</button>}</section>
    </div></>;
}

function ProfilePage({ user, go, onSignOut, onUserChanged }) {
  const [analyses, setAnalyses] = useState(null);
  const [name, setName] = useState(user.display_name || "");
  const [nameNote, setNameNote] = useState("");
  const [nameError, setNameError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwNote, setPwNote] = useState("");
  const [pwError, setPwError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.listAnalyses(1, 0).then(d => setAnalyses(d.total || 0)).catch(() => setAnalyses(null));
  }, []);
  const saveName = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setNameNote(""); setNameError("");
    try {
      const updated = await api.patchMe({ display_name: name.trim() });
      onUserChanged(updated);
      setNameNote("Display name updated.");
    } catch (err) { setNameError(friendlyError(err)); }
    setBusy(false);
  };
  const changePassword = async (e) => {
    e.preventDefault();
    setBusy(true); setPwNote(""); setPwError("");
    try {
      await api.patchMe({ current_password: currentPassword, new_password: newPassword });
      setPwNote("Password changed. Your other signed-in sessions were signed out.");
      setCurrentPassword(""); setNewPassword("");
    } catch (err) { setPwError(friendlyError(err)); }
    setBusy(false);
  };
  return <><PageHeader eyebrow="Workspace" title="Profile" text="Your communication workspace."><Button onClick={() => go("assistant")} icon={Plus}>New analysis</Button></PageHeader>
    <div className="history-list">
      <section className="panel history-item"><div><div className="profile-avatar" style={{ width: 56, height: 56, fontSize: 16 }}>{initials(user.display_name || user.email)}</div><h3 style={{ marginTop: 12 }}>{user.display_name || "No display name set"}</h3><p>{user.email}</p><div className="analysis-tags"><span>Member since {new Date(user.created_at).toLocaleDateString()}</span><span>Status: {user.status}</span>{analyses !== null && <span>{analyses} {analyses === 1 ? "analysis" : "analyses"} saved</span>}</div></div><button className="secondary-action" onClick={onSignOut}><LogOut size={15} /> Sign out</button></section>
      <section className="panel history-item"><div><small>Profile</small><h3>Display name</h3><p>This is the name shown across your workspace.</p>{nameError && <div className="form-error">{nameError}</div>}{nameNote && <div className="form-note">{nameNote}</div>}</div>
        <form onSubmit={saveName} style={{ display: "flex", gap: 8, alignItems: "center" }}><input className="field select-field" value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="Your display name" /><button className="secondary-action" type="submit" disabled={busy}>Save</button></form></section>
      <section className="panel history-item"><div><small>Security</small><h3>Change password</h3><p>Changing your password signs out your other sessions.</p>{pwError && <div className="form-error">{pwError}</div>}{pwNote && <div className="form-note">{pwNote}</div>}</div>
        <form onSubmit={changePassword} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="password" className="field select-field" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Current password" autoComplete="current-password" />
          <input type="password" className="field select-field" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password (8+ chars)" minLength={8} autoComplete="new-password" />
          <button className="secondary-action" type="submit" disabled={busy || !currentPassword || newPassword.length < 8}>Change password</button>
        </form></section>
      <section className="panel history-item"><div><small>Privacy</small><h3>Your data, your call</h3><p>Export everything or delete the account from Settings.</p></div><button className="secondary-action" onClick={() => go("settings")}><Settings size={15} /> Open settings</button></section>
    </div></>;
}

function ExtensionPage({ go }) {
  return <><PageHeader eyebrow="Workspace" title="Good communication, wherever work happens." text="A thoughtful layer for your browser."><Button onClick={() => go("demo-chat")} icon={Globe2}>Open local demo chat</Button></PageHeader><div className="placeholder-page panel"><div className="placeholder-icon"><Globe2 size={25} /></div><h2>Review suggestions without leaving your workflow.</h2><p>Download the extension below, unzip it, and load it in Chrome (chrome://extensions → Developer mode → Load unpacked). Clicking the extension icon opens this site; on any page, click the floating ✦ button to analyze the text on your screen — sign in once in the panel, then Analyze. The extension calls the real backend and shows the live intent, strategy and draft. It never monitors the page and never sends anything automatically.</p><div className="extension-actions"><a className="button" href="/saylient-extension.zip" download><Download size={15} /><span>Download extension (.zip)</span></a><Button variant="outline" onClick={() => go("demo-chat")}>Open local demo chat <ArrowRight size={15} /></Button></div></div></>;
}

/* Contact — a public page (no sign-in needed), reached from the landing
   nav, the footer, and the workspace sidebar. The form has no backend:
   submitting opens the visitor's email client via mailto, and the page
   says so plainly — nothing is sent or stored by Saylient AI. */
const CONTACT_EMAIL = "arsalanahmeda813@gmail.com";
const CONTACT_LINKEDIN = "https://www.linkedin.com/in/arsalan-ahmed-khan-b4a9a2310";
const CONTACT_GITHUB = "https://github.com/arsalanahmedk";

function ContactPage({ go, user }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [opened, setOpened] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    const subject = encodeURIComponent(`Saylient AI — message from ${name.trim() || "a visitor"}`);
    const body = encodeURIComponent(`${message.trim()}\n\n— ${name.trim()}${email.trim() ? ` (${email.trim()})` : ""}`);
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
    setOpened(true);
  };
  return <div className="landing">
    <PublicNav go={go} user={user} />
    <main className="shell contact-page">
      <PageHeader eyebrow="Contact" title="Talk to the person behind Saylient AI." text="Questions, feedback, or a collaboration idea — write to Arsalan directly."><Button variant="outline" onClick={() => go("landing")}>Back to the landing page</Button></PageHeader>
      <div className="contact-grid">
        <div className="panel contact-card">
          <div className="panel-icon accent"><UserRound size={18} /></div>
          <h2>Arsalan Ahmed Khan</h2>
          <p>Artificial Intelligence student at PAF-IAST, building Saylient AI — a communication assistant for freelancers.</p>
          <ul className="contact-list">
            <li><Mail size={15} /><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></li>
            <li><Linkedin size={15} /><a href={CONTACT_LINKEDIN} target="_blank" rel="noreferrer">linkedin.com/in/arsalan-ahmed-khan-b4a9a2310</a></li>
            <li><Github size={15} /><a href={CONTACT_GITHUB} target="_blank" rel="noreferrer">github.com/arsalanahmedk</a></li>
          </ul>
        </div>
        <form className="panel contact-form" onSubmit={submit}>
          <h2>Send a message</h2>
          <p>This opens your email app with the message addressed to Arsalan — nothing is sent or stored by Saylient AI.</p>
          <label>Your name<input className="field" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" maxLength={100} /></label>
          <label>Your email<input className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
          <label>Message<textarea className="field" value={message} onChange={e => setMessage(e.target.value)} placeholder="Hi Arsalan — …" required maxLength={2000} /></label>
          <Button type="submit" icon={Send}>Open email app</Button>
          {opened && <div className="form-note">Your email app should have opened with the message ready to send. If nothing opened, write directly to {CONTACT_EMAIL}.</div>}
        </form>
      </div>
    </main>
    <HalftoneFooter go={go} />
  </div>;
}

function DemoChat({ go }) {
  const [messages, setMessages] = useState([
    ["client", "Hi! I wanted to check whether the homepage concepts will be ready today.", "10:32 AM"],
    ["freelancer", "Hi Alex, I am putting the final details together now.", "10:34 AM"],
  ]);
  const [draft, setDraft] = useState("");
  const send = () => { if (!draft.trim()) return; setMessages([...messages, ["freelancer", draft.trim(), "Just now"]]); setDraft(""); };
  return <div className="demo-chat-page"><div className="demo-chat-header"><button className="link-button" onClick={() => go("landing")}>← Back</button><div className="profile-avatar">AM</div><div><strong>Alex Morgan</strong><small>Client · Website redesign</small></div><span className="online-dot" /> <span className="demo-label">Extension demo</span></div><div className="demo-messages">{messages.map(([role, text, time], index) => <div className={`demo-message ${role}`} data-demo-message data-message-id={index} key={`${index}-${text}`}><span className="demo-author">{role === "client" ? "Alex" : "You"}</span><p>{text}</p><small>{time}</small></div>)}</div><div className="demo-composer"><textarea data-demo-composer value={draft} onChange={event => setDraft(event.target.value)} placeholder="Write a message..." /><button onClick={send}><Send size={16} /> Send</button></div><p className="demo-disclaimer"><ShieldCheck size={13} /> Local demo only · Saylient AI never sends messages automatically</p></div>;
}

function AuthPage({ mode, go, onAuthed, notice, resetToken: initialToken }) {
  const [isLogin, setIsLogin] = useState(mode !== "register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(mode === "reset");
  const [resetToken, setResetToken] = useState(initialToken || "");
  const [newPassword, setNewPassword] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setError(""); setMessage(""); setBusy(true);
    try {
      if (forgot) {
        if (resetToken) {
          await api.resetPassword(resetToken, newPassword);
          setMessage("Password changed. Please sign in with your new password.");
          setForgot(false); setResetToken(""); setNewPassword("");
        } else {
          const res = await api.forgotPassword(email);
          if (res.reset_token) {
            setResetToken(res.reset_token);
            setMessage("Development mode: your reset token is shown below. In production it would be sent by email.");
          } else {
            setMessage(res.message || "If that email has an account, reset instructions were sent.");
          }
        }
      } else if (isLogin) {
        const auth = await api.login(email, password);
        onAuthed(auth);
      } else {
        const auth = await api.register(email, password, name.trim());
        onAuthed(auth);
      }
    } catch (err) { setError(friendlyError(err)); }
    setBusy(false);
  };
  return <div className="auth-page"><div className="auth-card panel">
    <Logo />
    <h1>{forgot ? "Reset your password" : isLogin ? "Welcome back" : "Create your account"}</h1>
    <p>{notice || "Your analyses, drafts and templates live in your account — not just in this browser."}</p>
    {error && <div className="form-error">{error}</div>}
    {message && <div className="form-note">{message}</div>}
    <form onSubmit={submit}>
      {!isLogin && !forgot && <label>Display name<input value={name} onChange={e => setName(e.target.value)} placeholder="Arsalan Ahmed Khan" maxLength={100} /></label>}
      <label>Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></label>
      {!forgot && <label>Password<input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder={isLogin ? "Your password" : "At least 8 characters"} minLength={isLogin ? 1 : 8} autoComplete={isLogin ? "current-password" : "new-password"} /></label>}
      {forgot && resetToken && <label>Reset token<input value={resetToken} readOnly /></label>}
      {forgot && resetToken && <label>New password<input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} autoComplete="new-password" /></label>}
      <Button type="submit" icon={Sparkles}>{busy ? "Please wait..." : forgot ? (resetToken ? "Set new password" : "Send reset link") : isLogin ? "Sign in" : "Create account"}</Button>
    </form>
    <div className="auth-links">
      {!forgot && <button className="link-button" onClick={() => { setIsLogin(!isLogin); setError(""); setMessage(""); }}>{isLogin ? "No account yet? Create one" : "Already have an account? Sign in"}</button>}
      {!forgot && isLogin && <button className="link-button" onClick={() => { setForgot(true); setError(""); setMessage(""); }}>Forgot password?</button>}
      {forgot && <button className="link-button" onClick={() => { setForgot(false); setResetToken(""); setError(""); setMessage(""); }}>Back to sign in</button>}
      <button className="link-button" onClick={() => go("landing")}>Back to the landing page</button>
    </div>
    <small className="model-note">Prototype: the backend stores your data in its own database. Never reuse a password from another account.</small>
  </div></div>;
}

function App() {
  const parseHash = () => {
    const raw = window.location.hash.slice(1) || "landing";
    const [path, query] = raw.split("?");
    const params = new URLSearchParams(query || "");
    return { page: path || "landing", token: params.get("token") || "" };
  };
  const [route, setRoute] = useState(parseHash);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [openAnalysis, setOpenAnalysis] = useState(null);
  const page = route.page;
  const go = p => {
    setRoute({ page: p, token: "" });
    window.history.replaceState(null, "", p === "landing" ? window.location.pathname : `#${p}`);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    // The session is an HttpOnly cookie: always ask the API who is
    // signed in. A 401 just means "visitor" — no error is shown.
    api.me()
      .then(data => { setUser(data); setAuthChecked(true); })
      .catch(() => { setUser(null); setAuthChecked(true); });
  }, []);
  const signOut = async () => {
    try { await api.logout(); } catch { /* the session is cleared either way */ }
    setUser(null); go("landing");
  };
  const onAuthed = (auth) => { setUser(auth.user); go("overview"); };
  const openInAssistant = (analysis) => { setOpenAnalysis(analysis); go("assistant"); };
  if (page === "landing") return <Landing go={go} user={user} />;
  if (page === "contact") return <ContactPage go={go} user={user} />;
  if (page === "login") return user ? <AuthPage mode="login" go={go} onAuthed={onAuthed} notice="You are already signed in — this will switch to another account." /> : <AuthPage mode="login" go={go} onAuthed={onAuthed} />;
  if (page === "register") return user ? <AuthPage mode="register" go={go} onAuthed={onAuthed} notice="You are already signed in — this will switch to another account." /> : <AuthPage mode="register" go={go} onAuthed={onAuthed} />;
  if (page === "reset-password") return <AuthPage mode="reset" go={go} onAuthed={onAuthed} resetToken={route.token} />;
  if (page === "demo-chat") return <DemoChat go={go} />;
  if (!authChecked) return <div className="auth-page"><div className="auth-card panel"><Logo /><h1>Loading…</h1><p>Checking your session.</p></div></div>;
  if (!user) return <AuthPage mode="login" go={go} onAuthed={onAuthed} notice="Sign in to open your workspace." />;
  return <Layout page={page} go={go} user={user} onSignOut={signOut}>{page === "overview" ? <Dashboard go={go} user={user} onOpen={openInAssistant} /> : page === "assistant" ? <Assistant go={go} openAnalysis={openAnalysis} clearOpen={() => setOpenAnalysis(null)} /> : <SimplePage type={page} go={go} user={user} onSignOut={signOut} onOpen={openInAssistant} onUserChanged={setUser} />}</Layout>;
}
createRoot(document.getElementById("root")).render(<App />);
