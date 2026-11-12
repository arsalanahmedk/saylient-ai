import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import {
  ArrowRight, BarChart3, BookOpen, Check, ChevronDown, CircleHelp,
  Clipboard, Clock3, Copy, Download, Gauge, Globe2, History, LayoutDashboard,
  Lightbulb, LogOut, Menu, MessageSquare, Moon, MoreHorizontal, PenLine,
  Plus, Search, Send, Settings, ShieldCheck, Sparkles, Target, Trash2,
  UserRound, WandSparkles, X, Zap
} from "lucide-react";
import "./styles.css";
import { api, getToken, setToken, friendlyError, prettyLabel, GOAL_VALUES, GOAL_LABELS } from "./api";

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
  ["settings", "Settings", Settings],
  ["profile", "Profile", UserRound],
];

const tunnelImages = [
  ["https://cdn.21st.dev/assets/mirror/c3/c3fbd2afa140223999a441b32ed986f61d473930002708df805a81532a326aac.jpg", "Context"],
  ["https://cdn.21st.dev/assets/mirror/9d/9d8b2f675a5814476ada3736ce439bcda23c5c389e0ebf9b25d8a0c09f3bbcfe.jpg", "Tone"],
  ["https://cdn.21st.dev/assets/mirror/8b/8bb738bf2f00d7f7ed3c3ec034adb9938ad38f4be4ac191d632a6a11ad525574.jpg", "Clarity"],
  ["https://cdn.21st.dev/assets/mirror/ac/ac5ac700b188d7ef16ee9dab868098b59f15c440db3f71d4e8c03262a3287577.jpg", "Intent"],
  ["https://cdn.21st.dev/assets/mirror/ef/ef25eff6ce655fba459b3b7e7711524dc92499aa18f6c7dbea9a0fcc56a8f908.jpg", "Politeness"],
  ["https://cdn.21st.dev/assets/mirror/f2/f28b370a5dcbf76240f1504579c4b05fc0ff0bb990a42aff8dc2f73a5dc46072.jpg", "Better work"],
];

function PerspectiveTunnelHero({ go }) {
  const containerRef = useRef(null);
  const reduce = useReducedMotion();
  const [stage, setStage] = useState({ width: 1440, height: 900, isMobile: false });
  const rawProgress = useMotionValue(0);
  const progress = useSpring(rawProgress, { stiffness: 80, damping: 30, restDelta: 0.0001 });
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);

  useEffect(() => {
    const update = () => setStage({ width: window.innerWidth, height: window.innerHeight, isMobile: window.innerWidth < 768 });
    const onPointerMove = event => {
      if (!reduce) {
        pointerX.set((event.clientX / window.innerWidth - 0.5) * 2);
        pointerY.set((event.clientY / window.innerHeight - 0.5) * 2);
      }
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [pointerX, pointerY, reduce]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const onWheel = event => {
      event.preventDefault();
      rawProgress.set(Math.min(1, Math.max(0, rawProgress.get() + event.deltaY * 0.0008)));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [rawProgress]);

  const titleScale = useTransform(progress, [0, 0.5, 1], [0.7, 1, 1.35]);
  const titleOpacity = useTransform(progress, [0, 0.12, 0.85, 1], [0.25, 1, 1, 0]);
  const promptOpacity = useTransform(progress, [0, 0.12], [1, 0]);
  const panStrength = stage.isMobile ? 20 : 45;

  return <section ref={containerRef} className="tunnel-hero" style={{ perspective: stage.isMobile ? "900px" : "1200px" }}>
    <div className="tunnel-grid" />
    <div className="tunnel-glow" />
    <div className="tunnel-ring tunnel-ring-small" />
    <div className="tunnel-ring tunnel-ring-large" />
    <motion.div className="tunnel-title" style={{ scale: titleScale, opacity: titleOpacity }}>
      <p>Context-aware communication intelligence</p>
      <h1>MAKE ROOM<br/><em>FOR BETTER</em><br/>CONVERSATIONS.</h1>
      <span>Scroll to move through the studio. Keep your intent. Change the impact.</span>
      <button className="shine-button" onClick={() => go("assistant")}>Open the assistant <ArrowRight size={14}/></button>
    </motion.div>
    <motion.div className="tunnel-prompt" style={{ opacity: promptOpacity }}><span>Scroll to explore</span><i/></motion.div>
    <div className="tunnel-cards">
      {tunnelImages.map(([src, title], index) => <TunnelCard key={title} src={src} title={title} index={index} total={tunnelImages.length} progress={progress} pointerX={pointerX} pointerY={pointerY} stage={stage} panStrength={panStrength}/>)}
    </div>
  </section>;
}

function TunnelCard({ src, title, index, total, progress, pointerX, pointerY, stage, panStrength }) {
  const angle = index * 137.5 * (Math.PI / 180);
  const start = (index / total) * 0.45;
  const local = useTransform(progress, [start, start + 0.55], [0, 1]);
  const z = useTransform(local, [0, 1], [stage.isMobile ? -1200 : -1700, stage.isMobile ? 350 : 500]);
  const opacity = useTransform(local, [0, 0.18, 0.82, 0.98], [0, 1, 1, 0]);
  const transform = useTransform([z, pointerX, pointerY], ([currentZ, px, py]) => {
    const x = Math.cos(angle) * stage.width * (0.28 + (index % 3) * 0.08) - px * panStrength;
    const y = Math.sin(angle) * stage.height * (0.26 + (index % 2) * 0.09) - py * panStrength;
    const rotation = (index % 2 ? -1 : 1) * (3 + (index % 5) * 2);
    return `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), ${currentZ}px) rotateZ(${rotation}deg)`;
  });
  return <motion.div className="tunnel-card" style={{ opacity, transform, zIndex: index + 1, width: stage.isMobile ? "38vw" : "18vw" }}>
    <div><img src={src} alt={title} draggable="false"/><span>{title}</span></div>
  </motion.div>;
}

function Logo() {
  return <div className="logo"><span className="logo-mark"><Sparkles size={16}/></span><span>saylient<span className="logo-ai">.ai</span></span></div>;
}

function Button({ children, variant = "primary", onClick, icon: Icon, type = "button" }) {
  const label = React.Children.toArray(children).filter(child => typeof child === "string").join(" ").trim() || "Continue";
  return <button type={type} className={`btn shine-button button-3d btn-${variant}`} onClick={onClick}>
    <span className="button-3d-bg" aria-hidden="true"/>
    <svg className="button-3d-splash" viewBox="0 0 342 208" aria-hidden="true">
      <path d="M54 100S40 91 27 98 2 98 2 98M285 100s14-9 27-2 28-2 28-2M231 57s-5-16 5-27 9-17 9-17M113 57s5-16-5-27-9-17-9-17"/>
      <path opacity=".3" d="M281 65s7-15 22-17 17-12 17-12M62 65S55 50 40 48 24 37 24 37M170 57s4-15 0-28-1-27-1-27"/>
    </svg>
    <span className="button-3d-content">
      {Icon && <Icon size={16}/>}
      <span className="button-3d-label"><span>{label}</span><span>{label === "Continue" ? "Join now" : "Start now"}</span></span>
    </span>
    <span className="button-3d-arrow" aria-hidden="true">→</span>
  </button>;
}

function HalftoneFooter() {
  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return undefined;
    const context = canvas.getContext("2d");
    if (!context) return undefined; // canvas unavailable (e.g. disabled): the footer simply stays blank.
    let frame = 0;
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
      maskContext.font = `800 ${fontSize}px "Space Grotesk", sans-serif`;
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
          const warmth = Math.max(0, 1 - distance / 95) * alpha;
          context.fillStyle = `rgb(${Math.round(233 - warmth * 33)},${Math.round(229 + warmth * 14)},${Math.round(218 - warmth * 90)})`;
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
      cancelAnimationFrame(frame);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", leave);
      window.removeEventListener("resize", draw);
    };
  }, []);
  return <footer ref={rootRef} className="halftone-footer">
    <canvas ref={canvasRef} aria-hidden="true"/>
    <div className="halftone-top">
      <div><strong>Saylient AI studio</strong><span>© 2026 · Context / Tone / Clarity</span></div>
      <div><small>Explore</small><a href="#features">Product</a><a href="#how">How it works</a><a href="#theory">The framework</a></div>
      <div><small>Connect</small><a href="mailto:hello@saylient.ai">hello@saylient.ai</a><a href="#extension">Browser extension</a><a href="#assistant">Start a conversation</a></div>
      <div><small>Studio</small><span>Made for messages that matter.</span><button onClick={() => window.scrollTo({top: 0, behavior: "smooth"})}>Back to top ↑</button></div>
    </div>
    <div className="halftone-rule"><span>saylient.ai / communication studio</span><span>Keep the intent. Change the impact.</span></div>
  </footer>;
}

function Landing({ go, user }) {
  return <div className="landing">
    <div className="video-topbar"><span>✦ saylient.ai</span><span>Communication intelligence for modern work</span><Button onClick={() => go("assistant")}>Open workspace <ArrowRight size={14}/></Button></div>
    <nav className="video-nav" aria-label="Primary navigation">
      <Logo />
      <div className="video-nav-links"><a href="#features">Discover</a><a href="#how">The method</a><a href="#theory">Framework</a><a href="#extension">Extension</a></div>
      {user ? <button className="video-text-link" onClick={() => go("overview")}>{user.display_name || user.email} · Workspace</button> : <button className="video-text-link" onClick={() => go("login")}>Sign in</button>}
      <button className="video-menu" onClick={() => go("assistant")}>MENU <Menu size={14}/></button>
    </nav>
    <main>
      <PerspectiveTunnelHero go={go}/>
      <section className="video-hero">
        <div className="hero-orbit hero-orbit-left"><div className="orbit-note">Context<br/><b>01</b></div><div className="orbit-note blue">Tone<br/><b>02</b></div></div>
        <div className="video-hero-copy"><div className="video-kicker">NEXT-LEVEL COMMUNICATION TOOLS</div><h1>Say what you<br/>mean <span>better.</span></h1><p>Saylient AI gives every important message a second set of eyes, so you can keep your intent and change the impact.</p><div className="video-hero-actions"><Button onClick={() => go("assistant")} icon={WandSparkles}>Start writing clearly</Button><button className="video-text-link" onClick={() => document.getElementById("features")?.scrollIntoView({behavior:"smooth"})}>Explore the studio <ArrowRight size={14}/></button></div></div>
        <div className="hero-orbit hero-orbit-right"><div className="orbit-card"><span>84</span><small>clarity score</small></div><div className="orbit-card paper"><span>“</span><small>Keep the intent.<br/>Change the impact.</small></div></div>
        <div className="hero-wordmark">SAYLIENT<span>AI</span></div>
      </section>
      <section className="video-intro shell"><div className="video-kicker">BUILT FOR BETTER CONVERSATIONS</div><h2>One calm layer between<br/><span>thinking and sending.</span></h2><p>Understand the subtext, find the right words, and build communication confidence without leaving the flow of work.</p></section>
      <section id="features" className="video-feature-section shell"><div className="video-feature-heading"><span>Discover</span><h2>The communication<br/><u>studio.</u></h2><p>Choose a lens. Make the next message land the way you meant it to.</p></div><div className="video-feature-grid"><Feature icon={Target} title="Understand the subtext" text="See intent, tone, and social dynamics behind any message." color="purple"/><Feature icon={WandSparkles} title="Find the right words" text="Shape thoughtful responses that still sound like you." color="cyan"/><Feature icon={Gauge} title="Build confidence" text="Learn the patterns that make communication clear." color="green"/></div></section>
      <section className="section shell"><div className="section-heading"><div><div className="eyebrow">A better way to communicate</div><h2>Make every message<br/><em>work harder.</em></h2></div><p>From a quick follow-up to a difficult boundary, get context-aware guidance before you hit send.</p></div>
        <div className="video-demo-panel"><div className="demo-panel-copy"><div className="video-kicker">THE SAYLIENT AI METHOD</div><h2>Clarity you can<br/><u>use in seconds.</u></h2><p>Share a message. See what it is doing. Choose a response that sounds like you, only clearer.</p><Button onClick={() => go("assistant")}>Try a live analysis <ArrowRight size={14}/></Button></div><div className="demo-panel-ui"><span>MESSAGE ASSISTANT / 01</span><strong>“I need the files today.<br/>This is taking longer than expected.”</strong><div><i/><i/><i/><i/><i/></div></div></div>
      </section>
      <section id="how" className="section workflow-section"><div className="shell"><div className="center-heading"><div className="eyebrow">From thought to send</div><h2>Clarity at every <em>step.</em></h2><p>Saylient AI turns communication theory into practical help you can use in seconds.</p></div><div className="steps"><Step n="01" title="Share the context" text="Tell us who you're talking to and what you want to achieve."/><Step n="02" title="Understand the message" text="We surface intent, tone, and social dynamics that matter."/><Step n="03" title="Send with confidence" text="Choose a response that sounds like you, only clearer." last/></div></div></section>
      <section id="theory" className="theory-banner shell"><div><div className="eyebrow">Grounded in research</div><h2>The science of<br/><em>being understood.</em></h2><p>Built on Brown and Levinson's Politeness Theory, Saylient AI helps you balance clarity with consideration — without making you sound generic.</p><Button variant="outline" onClick={() => go("theory")}>Explore politeness theory <ArrowRight size={15}/></Button></div><div className="theory-cards"><div className="theory-card"><span className="theory-number">01</span><strong>Positive face</strong><p>The desire to feel appreciated and valued.</p></div><div className="theory-card active"><span className="theory-number">02</span><strong>Negative face</strong><p>The desire for autonomy and freedom from pressure.</p></div><div className="theory-card"><span className="theory-number">03</span><strong>Face-threatening acts</strong><p>Messages that can challenge either need.</p></div></div></section>
      <section id="extension" className="extension-cta shell"><div className="browser-icon"><Globe2 size={26}/></div><div><div className="eyebrow">Coming to your browser</div><h2>Good communication,<br/><em>wherever work happens.</em></h2></div><div className="extension-copy"><p>Bring Saylient AI into the conversations you already have. Review suggestions without leaving your workflow.</p><Button variant="outline" onClick={() => go("extension")}>Learn about the extension <ArrowRight size={15}/></Button></div></section>
      <section className="final-cta"><div className="shell center-heading"><div className="eyebrow">Your next message starts here</div><h2>Say it better.<br/><em>Feel the difference.</em></h2><Button onClick={() => go("assistant")} icon={Sparkles}>Try Saylient AI free <ArrowRight size={15}/></Button></div></section>
    </main>
    <div className="video-rail"><span>✦</span><a href="#features">Discover</a><a href="#how">The method</a><a href="#theory">Framework</a><a href="#extension">Extension</a><Button onClick={() => go("assistant")}>Start free <ArrowRight size={13}/></Button></div>
    <HalftoneFooter/>
  </div>;
}

function Feature({icon: Icon, title, text, color}) { return <div className="feature-card"><div className={`feature-icon ${color}`}><Icon size={21}/></div><h3>{title}</h3><p>{text}</p><a href="#how">Learn more <ArrowRight size={13}/></a></div>; }
function Step({n,title,text,last}) { return <div className="step"><div className="step-number">{n}</div><div className="step-line">{!last && <span/>}</div><div><h3>{title}</h3><p>{text}</p></div></div>; }
function ShowcaseCard({tone,title,label,go,children}) { return <button className={`showcase-card ${tone}`} onClick={go}><div className="showcase-preview">{children}<span className="showcase-arrow"><ArrowRight size={31}/></span></div><div className="showcase-caption"><span>{label}</span><strong>{title}</strong></div></button>; }

function Layout({ page, go, user, onSignOut, children }) {
  const [mobile, setMobile] = useState(false);
  return <div className="app-shell"><aside className={mobile ? "sidebar open" : "sidebar"}><div className="side-logo"><Logo/><button className="mobile-close" onClick={() => setMobile(false)}><X size={18}/></button></div><div className="side-label">Workspace</div><nav>{navItems.map(([id,label,Icon]) => <button key={id} className={page === id ? "side-link active" : "side-link"} onClick={() => {go(id);setMobile(false)}}><Icon size={17}/>{label}{id === "assistant" && <span className="new-dot"/>}</button>)}</nav><div className="side-label lower">Account</div><button className={`side-link ${page === "settings" ? "active" : ""}`} onClick={() => go("settings")}><Settings size={17}/>Settings</button><button className="side-link" onClick={onSignOut}><LogOut size={17}/>Sign out</button><div className="upgrade-card"><Sparkles size={17}/><strong>Prototype build</strong><p>Analyses run on the rule-based engine (prototype-0.1). Your data lives in your account.</p><button onClick={() => go("assistant")}>Analyze a message <ArrowRight size={13}/></button></div><button className="profile profile-button" onClick={() => go("profile")}><div className="profile-avatar">{initials(user.display_name || user.email)}</div><div><strong>{user.display_name || user.email}</strong><small>{user.email}</small></div><MoreHorizontal size={16}/></button></aside><div className="main-area"><header className="app-header"><button className="menu-button" onClick={() => setMobile(true)}><Menu size={20}/></button><div className="breadcrumb"><span>Workspace</span><ChevronDown size={14}/><strong>{navItems.find(x => x[0] === page)?.[1] || "Overview"}</strong></div><div className="header-actions"><button aria-label="Help" onClick={() => go("theory")}><CircleHelp size={18}/></button><button aria-label="Toggle theme"><Moon size={18}/></button><button className="header-avatar" onClick={() => go("profile")}>{initials(user.display_name || user.email)}</button></div></header><main className="dashboard-content">{children}</main></div></div>;
}

function PageHeader({eyebrow, title, text, children}) { return <div className="page-header"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{text && <p>{text}</p>}</div>{children}</div>; }
function Dashboard({ go, user, onOpen }) {
  const [data, setData] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listAnalyses(100, 0), api.listTemplates(50, 0)])
      .then(([a, t]) => { if (!cancelled) { setData(a); setTemplates(t.items || []); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(friendlyError(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);
  const firstName = (user?.display_name || user?.email || "there").split(" ")[0];
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const items = data?.items || [];
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const thisWeek = items.filter(i => new Date(i.created_at).getTime() >= weekAgo).length;
  const avgConfidence = items.length ? Math.round(items.reduce((s, i) => s + (i.intent?.confidence || 0), 0) / items.length * 100) : null;
  const mostCommon = (key) => {
    const counts = {};
    items.forEach(i => { const v = key(i); if (v) counts[v] = (counts[v] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top ? { label: top[0], count: top[1] } : null;
  };
  const topIntent = mostCommon(i => i.intent?.label);
  const topStrategy = mostCommon(i => i.strategy?.label);
  const ftaCount = items.filter(i => i.fta?.detected).length;
  const buckets = [0, 0, 0, 0, 0];
  items.forEach(i => {
    const days = Math.floor((Date.now() - new Date(i.created_at).getTime()) / (24 * 3600 * 1000));
    if (days >= 0 && days < 30) buckets[4 - Math.floor(days / 6)] += 1;
  });
  const maxBucket = Math.max(1, ...buckets);
  const points = buckets.map((v, i) => [i * 150, 160 - (v / maxBucket) * 140]);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const area = `${line} L600 170 L0 170 Z`;
  const recent = items.slice(0, 3);
  return <>
    <PageHeader eyebrow={today} title={<>Good to see you, {firstName} <span className="wave">✦</span></>} text="Your real communication overview — data comes from your account, not a demo."><Button onClick={() => go("assistant")} icon={Plus}>New analysis</Button></PageHeader>
    {error && <div className="form-error panel">{error}</div>}
    {loading ? <div className="panel placeholder-page"><div className="placeholder-icon"><Sparkles size={25}/></div><h2>Loading your overview…</h2></div> : <>
    <div className="stats-grid">
      <Stat title="Messages analyzed" value={String(data?.total ?? items.length)} change={`${thisWeek} this week`} icon={MessageSquare} color="purple"/>
      <Stat title="Saved templates" value={String(templates.length)} change="In your account" icon={Clipboard} color="cyan"/>
      <Stat title="Avg. intent confidence" value={avgConfidence === null ? "—" : `${avgConfidence}%`} change={items.length ? `Across ${items.length} ${items.length === 1 ? "analysis" : "analyses"}` : "No analyses yet"} icon={Gauge} color="green"/>
      <Stat title="Flagged face concerns" value={String(ftaCount)} change={items.length ? `${Math.round(ftaCount / items.length * 100)}% of messages` : "No analyses yet"} icon={Clock3} color="orange"/>
    </div>
    <div className="dashboard-grid">
      <section className="panel activity-panel"><div className="panel-heading"><div><h3>Communication activity</h3><p>Your analyses over the last 30 days</p></div></div>
        <div className="fake-chart"><div className="chart-y"><span>{maxBucket}</span><span>{Math.ceil(maxBucket / 2)}</span><span>0</span></div><div className="chart-area"><div className="grid-lines"><i/><i/><i/><i/><i/></div>
        <svg viewBox="0 0 600 170" preserveAspectRatio="none"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8b5cf6" stopOpacity=".3"/><stop offset="1" stopColor="#8b5cf6" stopOpacity="0"/></linearGradient></defs>
        {items.length ? <><path d={area} fill="url(#chartFill)"/><path d={line} fill="none" stroke="#a78bfa" strokeWidth="3"/></> : <text x="300" y="85" textAnchor="middle" fill="#94a3b8" fontSize="13">No analyses yet — try the assistant.</text>}
        </svg><div className="chart-x"><span>30 days ago</span><span>24 days</span><span>18 days</span><span>12 days</span><span>Today</span></div></div></div>
      </section>
      <section className="panel insights-panel"><div className="panel-heading"><div><h3>Recent AI insights</h3><p>From your actual analyses</p></div></div>
        {items.length ? <>
          {topIntent && <Insight icon={Target} title={`Most often: ${prettyLabel(topIntent.label)}`} text={`${topIntent.count} of ${items.length} ${items.length === 1 ? "message" : "messages"} had this intent.`} />}
          {topStrategy && <Insight icon={Lightbulb} title={`Usual strategy: ${prettyLabel(topStrategy.label)}`} text={`${topStrategy.count} of ${items.length} analyses recommended it.`} />}
          <Insight icon={Zap} title={ftaCount ? `${ftaCount} message${ftaCount === 1 ? "" : "s"} flagged a face concern` : "No face concerns flagged"} text={ftaCount ? "Review the breakdown before you send." : "Keep it up — or analyze a trickier message."} />}
        </> : <Insight icon={Lightbulb} title="Nothing analyzed yet" text="Analyze a message and your patterns will show up here." />}
      </section>
    </div>
    <section className="panel recent-panel"><div className="panel-heading"><div><h3>Recent conversations</h3><p>Your latest analyses</p></div><button className="link-button" onClick={() => go("history")}>View all <ArrowRight size={14}/></button></div>
      {recent.length ? <div className="conversation-table">{recent.map(c => <div className="conversation-row" key={c.id}><div className="conversation-icon"><MessageSquare size={16}/></div><div className="conversation-name"><strong>{prettyLabel(c.intent?.label)}</strong><span>{c.message}</span></div><span className="conversation-date">{new Date(c.created_at).toLocaleDateString()}</span><div className="score-pill"><span/> {Math.round((c.intent?.confidence || 0) * 100)}%</div><button className="icon-button" onClick={() => onOpen(c)} aria-label="Open in assistant"><ArrowRight size={16}/></button></div>)}</div> : <div className="placeholder-page"><div className="placeholder-icon"><History size={25}/></div><h2>No analyses yet.</h2><p>Your first analysis will appear here.</p><Button onClick={() => go("assistant")} icon={Sparkles}>Analyze a message</Button></div>}
    </section></>}
  </>;
}
function Stat({title,value,change,icon:Icon,color}) { return <div className="stat-card"><div className={`stat-icon ${color}`}><Icon size={18}/></div><div className="stat-value">{value}</div><div className="stat-title">{title}</div><div className="stat-change"><span>↗</span> {change}</div></div>; }
function Insight({icon:Icon,title,text}) { return <div className="insight"><div className="insight-icon"><Icon size={16}/></div><div><strong>{title}</strong><p>{text}</p></div></div>; }

function Assistant({ go, openAnalysis, clearOpen }) {
  const [message, setMessage] = useState("Hey, I need the final files today. This is taking longer than expected.");
  const [context, setContext] = useState("");
  const [goal, setGoal] = useState("Set a boundary");
  const [role, setRole] = useState("Freelancer");
  const [power, setPower] = useState("unknown");
  const [distance, setDistance] = useState("unknown");
  const [imposition, setImposition] = useState("unknown");
  const [tone, setTone] = useState("Diplomatic");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [draftId, setDraftId] = useState(null);
  const [savedNote, setSavedNote] = useState("");

  useEffect(() => {
    if (!openAnalysis) return;
    setAnalysis(openAnalysis);
    setMessage(openAnalysis.message || "");
    setGoal(GOAL_LABELS[openAnalysis.goal] || "Set a boundary");
    const cf = openAnalysis.context_factors || {};
    setPower(cf.power || "unknown");
    setDistance(cf.social_distance || "unknown");
    setImposition(cf.imposition || "unknown");
    setDraftId(null); setSavedNote(""); setError("");
    api.listDrafts(openAnalysis.id).then(d => {
      const latest = (d.items || [])[0];
      if (latest) setDraftId(latest.id);
    }).catch(() => {});
    clearOpen();
  }, [openAnalysis]);

  const analyze = async () => {
    if (!message.trim() || message.length > 2000) return;
    setLoading(true); setError(""); setSavedNote("");
    try {
      const result = await api.createAnalysis({
        message: message.trim(),
        conversation_context: context.trim() ? [{ role: "prior", text: context.trim() }] : [],
        goal: GOAL_VALUES[goal],
        context: { power, social_distance: distance, imposition },
      });
      setAnalysis(result); setDraftId(null);
    } catch (err) { setError(friendlyError(err)); }
    setLoading(false);
  };
  const saveDraft = async (draftText, toneSetting) => {
    if (!analysis) return;
    try {
      if (draftId) {
        await api.patchDraft(draftId, { draft_text: draftText, tone_setting: toneSetting });
      } else {
        const created = await api.createDraft(analysis.id, { draft_text: draftText, tone_setting: toneSetting });
        setDraftId(created.id);
      }
      setSavedNote("Draft saved to this analysis.");
    } catch (err) { setError(friendlyError(err)); }
  };
  return <><PageHeader eyebrow="Message assistant" title="Find the right words." text="Add a little context, and we'll help you say what you mean."><span className="demo-badge"><span/> Live analysis · {role}</span></PageHeader><div className="assistant-layout"><section className="panel assistant-form"><div className="assistant-title"><div className="panel-icon purple"><MessageSquare size={17}/></div><div><h3>Your message</h3><p>Context is user supplied; predictions are labelled.</p></div></div>
  {error && <div className="form-error">{error}</div>}
  <label>Conversation context <span>Optional</span><textarea className="context-textarea" value={context} onChange={e => setContext(e.target.value)} placeholder="What happened before this message?"/></label>
  <div className="field-row"><label>I'm a <div className="segmented">{["Freelancer", "Client"].map(item => <button key={item} className={role === item ? "selected" : ""} onClick={() => setRole(item)}>{item}</button>)}</div></label><label>Communication goal<select className="field select-field" value={goal} onChange={e => setGoal(e.target.value)}>{GOAL_OPTIONS.map(item => <option key={item}>{item}</option>)}</select></label></div>
  <div className="field-row three"><label>Power<select className="field select-field" value={power} onChange={e => setPower(e.target.value)}>{PDR_OPTIONS.map(v => <option key={v} value={v}>{v === "unknown" ? "Unknown" : prettyLabel(v)}</option>)}</select></label><label>Social distance<select className="field select-field" value={distance} onChange={e => setDistance(e.target.value)}>{PDR_OPTIONS.map(v => <option key={v} value={v}>{v === "unknown" ? "Unknown" : prettyLabel(v)}</option>)}</select></label><label>Imposition<select className="field select-field" value={imposition} onChange={e => setImposition(e.target.value)}>{PDR_OPTIONS.map(v => <option key={v} value={v}>{v === "unknown" ? "Unknown" : prettyLabel(v)}</option>)}</select></label></div>
  <label>Original message<textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Write the message you'd like help with..."/></label><div className="unknown-note"><CircleHelp size={13}/> Power, distance and imposition stay unknown unless you set them — the engine will say so instead of guessing.</div><div className="assistant-form-footer"><span className="char-count">{message.length}/2000</span><Button onClick={analyze} icon={loading ? undefined : Sparkles}>{loading ? "Analyzing..." : "Analyze conversation"}</Button></div></section><section className="panel result-panel">{!analysis ? <div className="empty-result"><div className="empty-spark"><Sparkles size={25}/></div><h3>Your thoughtful response<br/>starts here.</h3><p>We'll look at intent, tone, possible face concerns, and strategy without pretending to know the recipient's feelings.</p><div className="mini-points"><span><Check size={13}/> Context-aware</span><span><Check size={13}/> Review before sending</span></div></div> : <Result analysis={analysis} tone={tone} setTone={setTone} onSave={saveDraft} onRegenerate={analyze} savedNote={savedNote} />}</section></div></>;
}
function Result({ analysis, tone, setTone, onSave, onRegenerate, savedNote }) {
  const [draft, setDraft] = useState(analysis.draft);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(analysis.draft); }, [analysis.id]);
  const copy = async () => { await navigator.clipboard?.writeText(draft); setCopied(true); setTimeout(() => setCopied(false), 1400); };
  const save = async () => { setSaving(true); await onSave(draft, tone); setSaving(false); };
  const faceLabels = (analysis.face_concern || []).map(f => f === "positive_face" ? "Positive face" : f === "negative_face" ? "Negative face" : prettyLabel(f));
  const cf = analysis.context_factors || {};
  const pdr = (v) => v === "unknown" ? "Unknown" : prettyLabel(v);
  return <div className="result-content"><div className="result-top"><div><div className="result-kicker"><span className="ai-icon"><Sparkles size={14}/></span> Live analysis · {analysis.model_version}</div><h3>A clearer way to say it</h3></div><span className="result-tag"><Check size={12}/> Review required</span></div><div className="analysis-tags"><span><b>Intent</b> {prettyLabel(analysis.intent?.label)} · {Math.round((analysis.intent?.confidence || 0) * 100)}%</span><span><b>Tone</b> {prettyLabel(analysis.tone?.label)} · {Math.round((analysis.tone?.confidence || 0) * 100)}%</span><span><b>FTA</b> {analysis.fta?.detected ? analysis.fta.description : "None detected"}</span></div><div className="analysis-breakdown"><div><small>Face concerns</small><p>{faceLabels.length ? faceLabels.join(" · ") : "None flagged."}</p></div><div><small>Strategy</small><p>{prettyLabel(analysis.strategy?.label)}</p></div><div><small>P / D / R</small><p>Power: {pdr(cf.power)} · Distance: {pdr(cf.social_distance)} · Imposition: {pdr(cf.imposition)}</p></div></div><div className="strategy-card"><span>Recommended strategy</span><strong>{prettyLabel(analysis.strategy?.label)}</strong><p>{analysis.strategy?.rationale}</p></div><div className="response-card"><div className="response-card-head"><span>Editable suggested response</span><button onClick={copy}><Copy size={14}/> {copied ? "Copied" : "Copy"}</button></div><textarea className="draft-editor" value={draft} onChange={e => setDraft(e.target.value)}/><div className="response-note"><Lightbulb size={14}/><span>{(analysis.limitations || []).join(" ")}</span></div></div><div className="tone-section"><span>Response tone</span><div className="tone-options">{["Professional", "Friendly", "Diplomatic", "Assertive", "Empathetic"].map(t => <button className={tone === t ? "active" : ""} onClick={() => setTone(t)} key={t}>{t}</button>)}</div></div><div className="result-actions"><button className="secondary-action" onClick={() => setDraft(analysis.draft)}><Trash2 size={15}/> Reset draft</button><button className="secondary-action" onClick={save} disabled={saving}><History size={15}/> {saving ? "Saving..." : "Save draft"}</button><Button onClick={onRegenerate} icon={WandSparkles}>Regenerate</Button></div>{savedNote && <div className="form-note">{savedNote}</div>}<small className="model-note">Model: {analysis.model_version} · No message is sent automatically.</small></div>;
}
function SimplePage({ type, go, user, onSignOut, onOpen }) {
  if (type === "analysis") return <AnalysisPage go={go} onOpen={onOpen} />;
  if (type === "history") return <HistoryPage go={go} onOpen={onOpen} />;
  if (type === "templates") return <TemplatesPage go={go} />;
  if (type === "theory") return <TheoryPage go={go} />;
  if (type === "settings") return <SettingsPage user={user} go={go} onSignOut={onSignOut} />;
  if (type === "profile") return <ProfilePage user={user} go={go} onSignOut={onSignOut} />;
  if (type === "extension") return <ExtensionPage go={go} />;
  return <AnalysisPage go={go} onOpen={onOpen} />;
}
function HistoryPage({ go, onOpen }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    api.listAnalyses(50, 0)
      .then(d => { setItems(d.items || []); setTotal(d.total || 0); setLoading(false); })
      .catch(e => { setError(friendlyError(e)); setLoading(false); });
  };
  useEffect(load, []);
  const remove = async (id) => {
    if (!window.confirm("Delete this saved analysis?")) return;
    try { await api.deleteAnalysis(id); setItems(items.filter(item => item.id !== id)); setTotal(total - 1); }
    catch (e) { setError(friendlyError(e)); }
  };
  const filtered = items.filter(item => `${item.message} ${item.intent?.label || ""} ${item.strategy?.label || ""}`.toLowerCase().includes(query.toLowerCase()));
  return <><PageHeader eyebrow="Your private archive" title="Conversation history" text="Analyses are stored in your account. Deleting one removes it for good."><Button onClick={() => go("assistant")} icon={Plus}>New analysis</Button></PageHeader>
  {error && <div className="form-error panel">{error}</div>}
  <div className="history-toolbar panel"><Search size={16}/><input placeholder="Search saved conversations..." value={query} onChange={event => setQuery(event.target.value)} /><span>{total} saved</span></div>
  <div className="history-list">{loading ? <div className="placeholder-page panel"><div className="placeholder-icon"><History size={25}/></div><h2>Loading your history…</h2></div> : filtered.length ? filtered.map(item => <article className="panel history-item" key={item.id}><div><small>{prettyLabel(item.intent?.label)} · {new Date(item.created_at).toLocaleDateString()}</small><h3>{item.message}</h3><p>{item.draft}</p><div className="analysis-tags"><span>{prettyLabel(item.strategy?.label)}</span><span>{item.fta?.detected ? "Face concern flagged" : "No face concern"}</span></div></div><div style={{ display: "flex", gap: 8 }}><button className="secondary-action" onClick={() => onOpen(item)}><ArrowRight size={15}/> Open</button><button className="secondary-action" onClick={() => remove(item.id)}><Trash2 size={15}/> Delete</button></div></article>) : <div className="placeholder-page panel"><div className="placeholder-icon"><History size={25}/></div><h2>Your saved conversations will appear here.</h2><p>Analyze a message and it is saved to your account automatically.</p><Button onClick={() => go("assistant")} icon={Sparkles}>Analyze a message</Button></div>}</div></>;
}
function TemplatesPage({ go }) {
  const STARTERS = [
    { title: "Payment reminder", category: "Payment", text: "Hi Alex, I wanted to follow up on the outstanding invoice and check whether you have an expected payment date." },
    { title: "Scope boundary", category: "Work boundaries", text: "I can help with that change. To keep the current deadline, it would be best to treat it as a new scope item." },
    { title: "Deadline negotiation", category: "Deadline", text: "Would moving the delivery to Thursday work for you? That would give me enough time to keep the quality where it needs to be." },
  ];
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: "", category: "", body: "" });
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
  const filtered = items.filter(item => `${item.title} ${item.category} ${item.body}`.toLowerCase().includes(query.toLowerCase()));
  const savedTitles = new Set(items.map(i => i.title));
  return <><PageHeader eyebrow="Reusable language" title="Saved templates" text="Keep thoughtful starting points for the moments that matter."><Button onClick={() => go("assistant")} icon={Plus}>Create from assistant</Button></PageHeader>
  {error && <div className="form-error panel">{error}</div>}
  <div className="history-toolbar panel"><Search size={16}/><input placeholder="Search templates..." value={query} onChange={event => setQuery(event.target.value)} /><span>{filtered.length} templates</span></div>
  <form className="panel" onSubmit={create} style={{ marginBottom: 15 }}>
    <div className="field-row"><label>Title<input className="field select-field" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Payment reminder" maxLength={120} /></label><label>Category<input className="field select-field" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Payment" maxLength={60} /></label></div>
    <label>Template text<textarea className="context-textarea" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Write the template..." maxLength={2000} /></label>
    <Button type="submit" icon={Plus}>Save template</Button>
  </form>
  {loading ? <div className="placeholder-page panel"><div className="placeholder-icon"><Clipboard size={25}/></div><h2>Loading your templates…</h2></div> : <>
  <div className="template-grid">{filtered.map(item => <article className="panel template-item" key={item.id}><div className="template-top"><span>{item.category}</span><button onClick={() => navigator.clipboard?.writeText(item.body)} aria-label="Copy template"><Copy size={15}/></button></div><h3>{item.title}</h3><p>{item.body}</p><button className="link-button" onClick={() => remove(item.id)}>Delete <Trash2 size={14}/></button></article>)}</div>
  <div className="panel" style={{ marginTop: 15 }}><div className="panel-heading"><div><h3>Starter templates</h3><p>Save one to your account to make it yours.</p></div></div>
  <div className="template-grid" style={{ marginTop: 15 }}>{STARTERS.map(item => <article className="panel template-item" key={item.title}><div className="template-top"><span>{item.category}</span><button onClick={() => navigator.clipboard?.writeText(item.text)} aria-label="Copy template"><Copy size={15}/></button></div><h3>{item.title}</h3><p>{item.text}</p>{savedTitles.has(item.title) ? <span className="model-note">Saved to your account</span> : <button className="link-button" onClick={() => saveStarter(item)}>Save template <Plus size={14}/></button>}</article>)}</div></div>
  </>}
  </>;
}
  function DemoChat({ go }) {
    const [messages, setMessages] = useState([
      ["client", "Hi! I wanted to check whether the homepage concepts will be ready today.", "10:32 AM"],
      ["freelancer", "Hi Alex, I am putting the final details together now.", "10:34 AM"],
    ]);
    const [draft, setDraft] = useState("");
    const send = () => { if (!draft.trim()) return; setMessages([...messages, ["freelancer", draft.trim(), "Just now"]]); setDraft(""); };
    return <div className="demo-chat-page"><div className="demo-chat-header"><button className="link-button" onClick={() => go("landing")}>← Back</button><div className="profile-avatar">AM</div><div><strong>Alex Morgan</strong><small>Client · Website redesign</small></div><span className="online-dot"/> <span className="demo-label">Extension demo</span></div><div className="demo-messages">{messages.map(([role,text,time], index) => <div className={`demo-message ${role}`} data-demo-message data-message-id={index} key={`${index}-${text}`}><span className="demo-author">{role === "client" ? "Alex" : "You"}</span><p>{text}</p><small>{time}</small></div>)}</div><div className="demo-composer"><textarea data-demo-composer value={draft} onChange={event => setDraft(event.target.value)} placeholder="Write a message..."/><button onClick={send}><Send size={16}/> Send</button></div><p className="demo-disclaimer"><ShieldCheck size={13}/> Local demo only · Saylient AI never sends messages automatically</p></div>;
  }

function AuthPage({ mode, go, onAuthed, notice }) {
  const [isLogin, setIsLogin] = useState(mode !== "register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [resetToken, setResetToken] = useState("");
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
            setMessage("If that email has an account, reset instructions were sent.");
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
      <Button type="submit" icon={Sparkles}>{busy ? "Please wait..." : forgot ? (resetToken ? "Set new password" : "Send reset token") : isLogin ? "Sign in" : "Create account"}</Button>
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
  {loading ? <div className="panel placeholder-page"><div className="placeholder-icon"><BarChart3 size={25}/></div><h2>Loading your analyses…</h2></div> : items.length ? <div className="history-list">{items.map(item => <article className="panel history-item" key={item.id}><div><small>{prettyLabel(item.goal)} · {new Date(item.created_at).toLocaleDateString()}</small><h3>{item.message}</h3><div className="analysis-tags"><span><b>Intent</b> {prettyLabel(item.intent?.label)} · {Math.round((item.intent?.confidence || 0) * 100)}%</span><span><b>Tone</b> {prettyLabel(item.tone?.label)}</span><span><b>Strategy</b> {prettyLabel(item.strategy?.label)}</span><span>{item.fta?.detected ? "Face concern flagged" : "No face concern"}</span></div></div><button className="secondary-action" onClick={() => onOpen(item)}><ArrowRight size={15}/> Open</button></article>)}</div> : <div className="placeholder-page panel"><div className="placeholder-icon"><BarChart3 size={25}/></div><h2>Nothing analyzed yet.</h2><p>Analyze a message and its breakdown will appear here.</p><Button onClick={() => go("assistant")} icon={Sparkles}>Analyze a message</Button></div>}
  </>;
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
    <section className="panel history-item"><div><small>Account</small><h3>{user.display_name || user.email}</h3><p>{user.email} · Member since {new Date(user.created_at).toLocaleDateString()} · Status: {user.status}</p></div><button className="secondary-action" onClick={() => go("profile")}><UserRound size={15}/> View profile</button></section>
    <section className="panel history-item"><div><small>Privacy · your data</small><h3>Export my data</h3><p>Downloads a JSON file with your profile, analyses, drafts and templates.</p>{exportError && <div className="form-error">{exportError}</div>}{exportDone && <div className="form-note">{exportDone}</div>}</div><button className="secondary-action" onClick={doExport} disabled={exportBusy}><Download size={15}/> {exportBusy ? "Preparing..." : "Download export"}</button></section>
    <section className="panel history-item"><div><small>Privacy · danger zone</small><h3>Delete my account</h3><p>This permanently deletes your account, analyses, drafts and templates. It cannot be undone.</p>{deleteError && <div className="form-error">{deleteError}</div>}</div>{confirmDelete ? <div style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="password" className="field select-field" value={password} onChange={e => setPassword(e.target.value)} placeholder="Confirm your password" /><button className="secondary-action" onClick={doDelete}><Trash2 size={15}/> Delete forever</button><button className="secondary-action" onClick={() => { setConfirmDelete(false); setPassword(""); }}>Cancel</button></div> : <button className="secondary-action" onClick={() => setConfirmDelete(true)}><Trash2 size={15}/> Delete account</button>}</section>
    <section className="panel history-item"><div><small>Local preferences</small><h3>Appearance &amp; defaults</h3><p>Appearance: light editorial theme · Default tone: Diplomatic · Notifications: enabled. These preferences are stored in this browser only.</p></div><button className="secondary-action" onClick={() => go("assistant")}><Sparkles size={15}/> Open assistant</button></section>
  </div></>;
}

function ProfilePage({ user, go, onSignOut }) {
  const [analyses, setAnalyses] = useState(null);
  useEffect(() => {
    api.listAnalyses(1, 0).then(d => setAnalyses(d.total || 0)).catch(() => setAnalyses(null));
  }, []);
  return <><PageHeader eyebrow="Workspace" title="Profile" text="Your communication workspace."><Button onClick={() => go("assistant")} icon={Plus}>New analysis</Button></PageHeader>
  <div className="history-list">
    <section className="panel history-item"><div><div className="profile-avatar" style={{ width: 56, height: 56, fontSize: 16 }}>{initials(user.display_name || user.email)}</div><h3 style={{ marginTop: 12 }}>{user.display_name || "No display name set"}</h3><p>{user.email}</p><div className="analysis-tags"><span>Member since {new Date(user.created_at).toLocaleDateString()}</span><span>Status: {user.status}</span>{analyses !== null && <span>{analyses} {analyses === 1 ? "analysis" : "analyses"} saved</span>}</div></div><button className="secondary-action" onClick={onSignOut}><LogOut size={15}/> Sign out</button></section>
    <section className="panel history-item"><div><small>Privacy</small><h3>Your data, your call</h3><p>Export everything or delete the account from Settings. The display name cannot be changed yet — that comes with the next backend update.</p></div><button className="secondary-action" onClick={() => go("settings")}><Settings size={15}/> Open settings</button></section>
  </div></>;
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

function ExtensionPage({ go }) {
  return <><PageHeader eyebrow="Workspace" title="Good communication, wherever work happens." text="A thoughtful layer for your browser."><Button onClick={() => go("demo-chat")} icon={Globe2}>Open local demo chat</Button></PageHeader><div className="placeholder-page panel"><div className="placeholder-icon"><Globe2 size={25}/></div><h2>Review suggestions without leaving your workflow.</h2><p>Load the extension from the repo's extension/dist folder in Chrome (Developer mode → Load unpacked), open the local demo chat, and click the Saylient AI button. It reads the active conversation only when you click, and never sends anything automatically.</p><Button variant="outline" onClick={() => go("demo-chat")}>Open local demo chat <ArrowRight size={15}/></Button></div></>;
}

function App() {
  const [page, setPage] = useState(window.location.hash.slice(1) || "landing");
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [openAnalysis, setOpenAnalysis] = useState(null);
  const go = p => { setPage(p); window.history.replaceState(null, "", p === "landing" ? window.location.pathname : `#${p}`); window.scrollTo(0, 0); };
  useEffect(() => {
    if (!getToken()) { setAuthChecked(true); return; }
    api.me()
      .then(data => { setUser(data); setAuthChecked(true); })
      .catch(() => { setToken(null); setUser(null); setAuthChecked(true); });
  }, []);
  const signOut = async () => {
    try { await api.logout(); } catch { /* token is cleared either way */ }
    setToken(null); setUser(null); go("landing");
  };
  const onAuthed = (auth) => { setToken(auth.token); setUser(auth.user); go("overview"); };
  const openInAssistant = (analysis) => { setOpenAnalysis(analysis); go("assistant"); };
  if (page === "landing") return <Landing go={go} user={user} />;
  if (page === "login") return user ? <AuthPage mode="login" go={go} onAuthed={onAuthed} notice="You are already signed in — this will switch to another account." /> : <AuthPage mode="login" go={go} onAuthed={onAuthed} />;
  if (page === "register") return user ? <AuthPage mode="register" go={go} onAuthed={onAuthed} notice="You are already signed in — this will switch to another account." /> : <AuthPage mode="register" go={go} onAuthed={onAuthed} />;
  if (page === "demo-chat") return <DemoChat go={go} />;
  if (!authChecked) return <div className="auth-page"><div className="auth-card panel"><Logo /><h1>Loading…</h1><p>Checking your session.</p></div></div>;
  if (!user) return <AuthPage mode="login" go={go} onAuthed={onAuthed} notice="Sign in to open your workspace." />;
  return <Layout page={page} go={go} user={user} onSignOut={signOut}>{page === "overview" ? <Dashboard go={go} user={user} onOpen={openInAssistant} /> : page === "assistant" ? <Assistant go={go} openAnalysis={openAnalysis} clearOpen={() => setOpenAnalysis(null)} /> : <SimplePage type={page} go={go} user={user} onSignOut={signOut} onOpen={openInAssistant} />}</Layout>;
}
createRoot(document.getElementById("root")).render(<App />);
