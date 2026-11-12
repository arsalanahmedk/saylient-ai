import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import {
  ArrowRight, BarChart3, BookOpen, Check, ChevronDown, CircleHelp,
  Clipboard, Clock3, Copy, Gauge, Globe2, History, LayoutDashboard,
  Lightbulb, Menu, MessageSquare, Moon, MoreHorizontal, PenLine,
  Plus, Search, Send, Settings, ShieldCheck, Sparkles, Target, Trash2,
  UserRound, WandSparkles, X, Zap
} from "lucide-react";
import "./styles.css";

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

const conversations = [
  { title: "Website redesign — scope update", meta: "Today · 10:42 AM", score: 84, text: "Could we revisit the scope for the next milestone?" },
  { title: "Invoice #1048 follow-up", meta: "Yesterday · 4:18 PM", score: 91, text: "I wanted to check in on the invoice we discussed." },
  { title: "Homepage feedback round", meta: "Oct 19 · 1:05 PM", score: 78, text: "Would you be open to sharing feedback by Friday?" },
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

function Landing({ go }) {
  return <div className="landing">
    <div className="video-topbar"><span>✦ saylient.ai</span><span>Communication intelligence for modern work</span><Button onClick={() => go("assistant")}>Open workspace <ArrowRight size={14}/></Button></div>
    <nav className="video-nav" aria-label="Primary navigation">
      <Logo />
      <div className="video-nav-links"><a href="#features">Discover</a><a href="#how">The method</a><a href="#theory">Framework</a><a href="#extension">Extension</a></div>
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

function Layout({ page, go, children }) {
  const [mobile, setMobile] = useState(false);
  return <div className="app-shell"><aside className={mobile ? "sidebar open" : "sidebar"}><div className="side-logo"><Logo/><button className="mobile-close" onClick={() => setMobile(false)}><X size={18}/></button></div><div className="side-label">Workspace</div><nav>{navItems.map(([id,label,Icon]) => <button key={id} className={page === id ? "side-link active" : "side-link"} onClick={() => {go(id);setMobile(false)}}><Icon size={17}/>{label}{id === "assistant" && <span className="new-dot"/>}</button>)}</nav><div className="side-label lower">Account</div><button className={`side-link ${page === "settings" ? "active" : ""}`} onClick={() => go("settings")}><Settings size={17}/>Settings</button><div className="upgrade-card"><Sparkles size={17}/><strong>Unlock more clarity</strong><p>Get unlimited analyses and saved history.</p><button onClick={() => go("assistant")}>Upgrade plan <ArrowRight size={13}/></button></div><button className="profile profile-button" onClick={() => go("profile")}><div className="profile-avatar">AK</div><div><strong>Arsalan Ahmed Khan</strong><small>Free plan</small></div><MoreHorizontal size={16}/></button></aside><div className="main-area"><header className="app-header"><button className="menu-button" onClick={() => setMobile(true)}><Menu size={20}/></button><div className="breadcrumb"><span>Workspace</span><ChevronDown size={14}/><strong>{navItems.find(x => x[0] === page)?.[1] || "Overview"}</strong></div><div className="header-actions"><button aria-label="Help" onClick={() => go("theory")}><CircleHelp size={18}/></button><button aria-label="Toggle theme"><Moon size={18}/></button><button className="header-avatar" onClick={() => go("profile")}>AK</button></div></header><main className="dashboard-content">{children}</main></div></div>;
}

function PageHeader({eyebrow, title, text, children}) { return <div className="page-header"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{text && <p>{text}</p>}</div>{children}</div>; }
function Dashboard({go}) { return <><PageHeader eyebrow="Tuesday, October 27, 2025" title={<>Good morning, Arsalan <span className="wave">✦</span></>} text="A little clarity can make a big difference. Here's your communication overview."><Button onClick={() => go("assistant")} icon={Plus}>New analysis</Button></PageHeader><div className="stats-grid"><Stat title="Conversations analyzed" value="24" change="+12.5%" icon={MessageSquare} color="purple"/><Stat title="Responses generated" value="68" change="+8.2%" icon={Sparkles} color="cyan"/><Stat title="Communication score" value="84.6" change="+4.8%" icon={Gauge} color="green"/><Stat title="Time saved" value="3.2h" change="This week" icon={Clock3} color="orange"/></div><div className="dashboard-grid"><section className="panel activity-panel"><div className="panel-heading"><div><h3>Communication activity</h3><p>Your analysis activity over the last 30 days</p></div><button className="select-button">Last 30 days <ChevronDown size={14}/></button></div><div className="fake-chart"><div className="chart-y"><span>20</span><span>15</span><span>10</span><span>5</span><span>0</span></div><div className="chart-area"><div className="grid-lines"><i/><i/><i/><i/><i/></div><svg viewBox="0 0 600 170" preserveAspectRatio="none"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8b5cf6" stopOpacity=".3"/><stop offset="1" stopColor="#8b5cf6" stopOpacity="0"/></linearGradient></defs><path d="M0 130 C35 120 40 95 70 106 S110 130 140 95 S180 110 210 88 S250 107 280 72 S320 90 345 64 S385 92 415 42 S452 76 475 57 S520 85 550 35 S580 50 600 25 L600 170 L0 170Z" fill="url(#chartFill)"/><path d="M0 130 C35 120 40 95 70 106 S110 130 140 95 S180 110 210 88 S250 107 280 72 S320 90 345 64 S385 92 415 42 S452 76 475 57 S520 85 550 35 S580 50 600 25" fill="none" stroke="#a78bfa" strokeWidth="3"/></svg><div className="chart-x"><span>Oct 1</span><span>Oct 8</span><span>Oct 15</span><span>Oct 22</span><span>Today</span></div></div></div></section><section className="panel insights-panel"><div className="panel-heading"><div><h3>Recent AI insights</h3><p>Small observations, better outcomes</p></div><button className="icon-button"><MoreHorizontal size={17}/></button></div><Insight icon={Target} title="You soften requests well" text="Your messages balance clarity with consideration."/><Insight icon={Lightbulb} title="Try naming the shared goal" text="It can make difficult conversations feel collaborative."/><Insight icon={Zap} title="Your confidence is growing" text="Your communication score is up 4.8% this month."/></section></div><section className="panel recent-panel"><div className="panel-heading"><div><h3>Recent conversations</h3><p>Pick up where you left off</p></div><button className="link-button" onClick={() => go("history")}>View all <ArrowRight size={14}/></button></div><div className="conversation-table">{conversations.map(c => <div className="conversation-row" key={c.title}><div className="conversation-icon"><MessageSquare size={16}/></div><div className="conversation-name"><strong>{c.title}</strong><span>{c.text}</span></div><span className="conversation-date">{c.meta}</span><div className="score-pill"><span/> {c.score}</div><MoreHorizontal size={17} className="muted-icon"/></div>)}</div></section></>; }
function Stat({title,value,change,icon:Icon,color}) { return <div className="stat-card"><div className={`stat-icon ${color}`}><Icon size={18}/></div><div className="stat-value">{value}</div><div className="stat-title">{title}</div><div className="stat-change"><span>↗</span> {change}</div></div>; }
function Insight({icon:Icon,title,text}) { return <div className="insight"><div className="insight-icon"><Icon size={16}/></div><div><strong>{title}</strong><p>{text}</p></div></div>; }

function Assistant() {
  const [message,setMessage] = useState("Hey, I need the final files today. This is taking longer than expected.");
  const [context,setContext] = useState(""); const [goal,setGoal] = useState("Set a boundary"); const [role,setRole] = useState("Freelancer");
  const [tone,setTone] = useState("Diplomatic"); const [loading,setLoading] = useState(false); const [analysis,setAnalysis] = useState(null);
  const analyze = () => {
    if (!message.trim() || message.length > 500) return;
    setLoading(true);
    setTimeout(() => { setLoading(false); setAnalysis({ intent: goal === "Set a boundary" ? "Set a boundary" : goal, tone: "Direct with mild pressure", fta: "Possible negative-face threat", positive: "The recipient may want to feel trusted and respected.", negative: "The deadline request may limit their autonomy.", strategy: tone === "Assertive" ? "Positive politeness" : "Negative politeness", rationale: "This approach keeps the deadline visible while reducing unnecessary pressure and leaving room for context.", draft: "Hi Alex, I wanted to check in on the final files. Would it be possible to share them today? Let me know if anything is blocking the last steps.", limitations: "This is an illustrative demo result. P/D/R are not inferred from protected traits and remain unknown unless you provide them.", model: "demo-analysis-v1" }); }, 700);
  };
  const save = draft => { const items = JSON.parse(localStorage.getItem("saylient-history") || "[]"); items.unshift({ id: Date.now(), title: `${goal} · ${new Date().toLocaleDateString()}`, original: message, draft, intent: analysis?.intent || goal, strategy: analysis?.strategy || "Unknown" }); localStorage.setItem("saylient-history", JSON.stringify(items)); };
  return <><PageHeader eyebrow="Message assistant" title="Find the right words." text="Add a little context, and we'll help you say what you mean."><span className="demo-badge"><span/> Illustrative demo · {role}</span></PageHeader><div className="assistant-layout"><section className="panel assistant-form"><div className="assistant-title"><div className="panel-icon purple"><MessageSquare size={17}/></div><div><h3>Your message</h3><p>Context is user supplied; predictions are labelled.</p></div></div><label>Conversation context <span>Optional</span><textarea className="context-textarea" value={context} onChange={e => setContext(e.target.value)} placeholder="What happened before this message?"/></label><div className="field-row"><label>I'm a <div className="segmented">{["Freelancer","Client"].map(item => <button key={item} className={role === item ? "selected" : ""} onClick={() => setRole(item)}>{item}</button>)}</div></label><label>Communication goal<select className="field select-field" value={goal} onChange={e => setGoal(e.target.value)}>{["Set a boundary","Request payment","Negotiate deadline","Clarify requirements","Respond to criticism","Negotiate budget","Resolve disagreement"].map(item => <option key={item}>{item}</option>)}</select></label></div><label>Original message<textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Write the message you'd like help with..."/></label><div className="unknown-note"><CircleHelp size={13}/> Power, social distance, and imposition are unknown unless you add context.</div><div className="assistant-form-footer"><span className="char-count">{message.length}/500</span><Button onClick={analyze} icon={loading ? undefined : Sparkles}>{loading ? "Analyzing..." : "Analyze conversation"}</Button></div></section><section className="panel result-panel">{!analysis ? <div className="empty-result"><div className="empty-spark"><Sparkles size={25}/></div><h3>Your thoughtful response<br/>starts here.</h3><p>We'll look at intent, tone, possible face concerns, and strategy without pretending to know the recipient's feelings.</p><div className="mini-points"><span><Check size={13}/> Context-aware</span><span><Check size={13}/> Review before sending</span></div></div> : <Result analysis={analysis} tone={tone} setTone={setTone} onSave={save} onRegenerate={analyze}/>}</section></div></>;
}
function Result({analysis,tone,setTone,onSave,onRegenerate}) {
  const [draft,setDraft] = useState(analysis.draft); const [copied,setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard?.writeText(draft); setCopied(true); setTimeout(() => setCopied(false), 1400); };
  return <div className="result-content"><div className="result-top"><div><div className="result-kicker"><span className="ai-icon"><Sparkles size={14}/></span> Structured demo analysis</div><h3>A clearer way to say it</h3></div><span className="result-tag"><Check size={12}/> Review required</span></div><div className="analysis-tags"><span><b>Intent</b> {analysis.intent}</span><span><b>Tone</b> {analysis.tone}</span><span><b>FTA</b> {analysis.fta}</span></div><div className="analysis-breakdown"><div><small>Positive face</small><p>{analysis.positive}</p></div><div><small>Negative face</small><p>{analysis.negative}</p></div><div><small>P / D / R</small><p>Power: unknown · Distance: unknown · Imposition: unknown</p></div></div><div className="strategy-card"><span>Recommended strategy</span><strong>{analysis.strategy}</strong><p>{analysis.rationale}</p></div><div className="response-card"><div className="response-card-head"><span>Editable suggested response</span><button onClick={copy}><Copy size={14}/> {copied ? "Copied" : "Copy"}</button></div><textarea className="draft-editor" value={draft} onChange={e => setDraft(e.target.value)}/><div className="response-note"><Lightbulb size={14}/><span>{analysis.limitations}</span></div></div><div className="tone-section"><span>Response tone</span><div className="tone-options">{["Professional","Friendly","Diplomatic","Assertive","Empathetic"].map(t => <button className={tone === t ? "active" : ""} onClick={() => setTone(t)} key={t}>{t}</button>)}</div></div><div className="result-actions"><button className="secondary-action" onClick={() => setDraft("")}><Trash2 size={15}/> Reset draft</button><button className="secondary-action" onClick={() => onSave(draft)}><History size={15}/> Save to history</button><Button onClick={onRegenerate} icon={WandSparkles}>Regenerate</Button></div><small className="model-note">Model: {analysis.model} · No message is sent automatically.</small></div>;
}

function SimplePage({type, go}) {
  const content = {analysis:["Communication analysis","See the dynamics behind your words.","Understand intent, tone, and politeness strategy with a clear visual breakdown."],history:["Conversation history","Your communication, over time.","Search and revisit the conversations you've worked through with Saylient AI."],templates:["Saved templates","Your best words, ready when you need them.","Keep thoughtful starting points for the moments that matter."],theory:["Politeness theory","The science of being understood.","Learn the simple ideas behind clear, considerate communication."],extension:["Good communication, wherever work happens.","A thoughtful layer for your browser.","Review context-aware suggestions without leaving your workflow."],settings:["Settings","Make Saylient AI fit the way you work.","Control appearance, response defaults, privacy, notifications, and data management."],profile:["Profile","Your communication workspace.","Update your profile details and keep your assistant preferences close."]}; const [title,sub,text]=content[type] || content.analysis; const isSettings = type === "settings"; if (type === "history") return <HistoryPage go={go}/>; if (type === "templates") return <TemplatesPage go={go}/>; return <><PageHeader eyebrow={type === "theory" ? "Learn the framework" : "Workspace"} title={title} text={text}><Button onClick={() => go(type === "profile" ? "assistant" : "overview")} icon={type === "profile" ? PenLine : Plus}>{type === "profile" ? "Edit profile" : "Open workspace"}</Button></PageHeader><div className={`placeholder-page panel ${isSettings ? "settings-preview" : ""}`}><div className="placeholder-icon"><Sparkles size={25}/></div><h2>{sub}</h2><p>{isSettings ? "Appearance: light editorial theme · Default tone: Diplomatic · Notifications: enabled · Privacy: local demo mode." : "This area is ready for your real data. The prototype keeps this state intentionally clear while the assistant workflow is fully interactive."}</p><Button variant="outline" onClick={() => go(type === "extension" ? "demo-chat" : "assistant")}>{type === "extension" ? "Open local demo chat" : "Explore assistant"} <ArrowRight size={15}/></Button></div></>; }

function HistoryPage({go}) {
  const [items,setItems] = useState(() => JSON.parse(localStorage.getItem("saylient-history") || "[]"));
  const remove = id => { if (!window.confirm("Delete this saved analysis?")) return; const next = items.filter(item => item.id !== id); setItems(next); localStorage.setItem("saylient-history", JSON.stringify(next)); };
  return <><PageHeader eyebrow="Your private archive" title="Conversation history" text="Saved drafts remain in this browser until you delete them."><Button onClick={() => go("assistant")} icon={Plus}>New analysis</Button></PageHeader><div className="history-toolbar panel"><Search size={16}/><input placeholder="Search saved conversations..." onChange={event => setItems(JSON.parse(localStorage.getItem("saylient-history") || "[]").filter(item => `${item.title} ${item.original}`.toLowerCase().includes(event.target.value.toLowerCase())))} /><span>Illustrative demo data</span></div><div className="history-list">{items.length ? items.map(item => <article className="panel history-item" key={item.id}><div><small>{item.title}</small><h3>{item.original}</h3><p>{item.draft}</p><div className="analysis-tags"><span>{item.intent}</span><span>{item.strategy}</span></div></div><button className="secondary-action" onClick={() => remove(item.id)}><Trash2 size={15}/> Delete</button></article>) : <div className="placeholder-page panel"><div className="placeholder-icon"><History size={25}/></div><h2>Your saved conversations will appear here.</h2><p>Analyze a message, review the draft, and choose Save to history.</p><Button onClick={() => go("assistant")} icon={Sparkles}>Analyze a message</Button></div>}</div></>;
}

function TemplatesPage({go}) {
  const templates = [{title:"Payment reminder",category:"Payment",text:"Hi Alex, I wanted to follow up on the outstanding invoice and check whether you have an expected payment date."},{title:"Scope boundary",category:"Work boundaries",text:"I can help with that change. To keep the current deadline, it would be best to treat it as a new scope item."},{title:"Deadline negotiation",category:"Deadline",text:"Would moving the delivery to Thursday work for you? That would give me enough time to keep the quality where it needs to be."}];
  const [query,setQuery] = useState(""); const [saved,setSaved] = useState(() => JSON.parse(localStorage.getItem("saylient-templates") || "[]"));
  const save = template => { const next = [...saved, template]; setSaved(next); localStorage.setItem("saylient-templates", JSON.stringify(next)); };
  const list = [...saved, ...templates].filter(item => `${item.title} ${item.category} ${item.text}`.toLowerCase().includes(query.toLowerCase()));
  return <><PageHeader eyebrow="Reusable language" title="Saved templates" text="Keep thoughtful starting points for the moments that matter."><Button onClick={() => go("assistant")} icon={Plus}>Create from assistant</Button></PageHeader><div className="history-toolbar panel"><Search size={16}/><input placeholder="Search templates..." value={query} onChange={event => setQuery(event.target.value)} /><span>{list.length} templates</span></div><div className="template-grid">{list.map((item,index) => <article className="panel template-item" key={`${item.title}-${index}`}><div className="template-top"><span>{item.category}</span><button onClick={() => navigator.clipboard?.writeText(item.text)}><Copy size={15}/></button></div><h3>{item.title}</h3><p>{item.text}</p><button className="link-button" onClick={() => save(item)}>Save template <Plus size={14}/></button></article>)}</div></>;
}

  function DemoChat() {
    const [messages, setMessages] = useState([
      ["client", "Hi! I wanted to check whether the homepage concepts will be ready today.", "10:32 AM"],
      ["freelancer", "Hi Alex, I am putting the final details together now.", "10:34 AM"],
    ]);
    const [draft, setDraft] = useState("");
    const send = () => { if (!draft.trim()) return; setMessages([...messages, ["freelancer", draft.trim(), "Just now"]]); setDraft(""); };
    return <div className="demo-chat-page"><div className="demo-chat-header"><div className="profile-avatar">AM</div><div><strong>Alex Morgan</strong><small>Client · Website redesign</small></div><span className="online-dot"/> <span className="demo-label">Extension demo</span></div><div className="demo-messages">{messages.map(([role,text,time], index) => <div className={`demo-message ${role}`} data-demo-message data-message-id={index} key={`${index}-${text}`}><span className="demo-author">{role === "client" ? "Alex" : "You"}</span><p>{text}</p><small>{time}</small></div>)}</div><div className="demo-composer"><textarea data-demo-composer value={draft} onChange={event => setDraft(event.target.value)} placeholder="Write a message..."/><button onClick={send}><Send size={16}/> Send</button></div><p className="demo-disclaimer"><ShieldCheck size={13}/> Local demo only · Saylient AI never sends messages automatically</p></div>;
  }

  function App() { const [page,setPage] = useState(window.location.hash.slice(1) || "landing"); const go = p => { setPage(p); window.history.replaceState(null,"",p === "landing" ? window.location.pathname : `#${p}`); window.scrollTo(0,0); }; if(page === "landing") return <Landing go={go}/>; return <Layout page={page} go={go}>{page === "overview" ? <Dashboard go={go}/> : page === "assistant" ? <Assistant/> : page === "demo-chat" ? <DemoChat/> : <SimplePage type={page} go={go}/>}</Layout>; }
createRoot(document.getElementById("root")).render(<App />);
