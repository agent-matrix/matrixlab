/* ============================================================
   hf-space.jsx — Hugging Face Space chrome for ruslanmv/matrixlab
   ============================================================ */

function Ic({ d, size = 16, sw = 2, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      {d}
    </svg>
  );
}
const I = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  heart: <path d="M19 14c1.5-1.5 3-3.3 3-5.5A4.5 4.5 0 0 0 14.5 5L12 7.5 9.5 5A4.5 4.5 0 0 0 2 8.5C2 10.7 3.5 12.5 5 14l7 7Z" />,
  play: <path d="M5 3l14 9-14 9z" />,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  dots: <><circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" /></>,
  refresh: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>,
  expand: <><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></>,
  code: <><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  reset: <><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.7 3L3 8" /><path d="M3 3v5h5" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
};

function TopNav() {
  const links = [
    { label: "Models", ic: <><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></> },
    { label: "Datasets", ic: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.6 3.6 3 8 3s8-1.4 8-3V5" /></> },
    { label: "Spaces", ic: I.code, active: true },
    { label: "Posts", ic: I.chat },
    { label: "Docs", ic: I.book },
  ];
  return (
    <nav className="hf-nav">
      <div className="hf-nav-inner">
        <a className="hf-logo" href="#">
          <span className="mark">🤗</span>
          <span className="word">Hugging Face</span>
        </a>
        <label className="hf-search">
          <span style={{ color: "var(--hf-ink-4)", display: "inline-flex" }}><Ic d={I.search} size={16} sw={2.2} /></span>
          <input placeholder="Search models, datasets, users..." />
          <kbd>⌘K</kbd>
        </label>
        <div className="hf-navlinks">
          {links.map((l) => (
            <a key={l.label} className="hf-navlink" href="#" style={l.active ? { color: "var(--hf-ink)", background: "var(--hf-bg-mute)" } : null}>
              <span className="ic" style={{ display: "inline-flex" }}><Ic d={l.ic} size={15} sw={2} /></span>{l.label}
            </a>
          ))}
          <span className="hf-navlink" style={{ color: "var(--hf-ink-3)" }}>Pricing</span>
          <span className="hf-divider" />
          <button className="hf-btn-ghost">Log In</button>
          <button className="hf-btn-solid">Sign Up</button>
        </div>
        <button className="hf-burger"><Ic d={I.menu} size={20} /></button>
      </div>
    </nav>
  );
}

function SpaceHeader({ tab, setTab, liked, setLiked, onSettings }) {
  const tabs = [
    { id: "app", label: "App", ic: I.play },
    { id: "files", label: "Files", ic: I.file },
    { id: "community", label: "Community", ic: I.chat, count: "3" },
  ];
  return (
    <header className="hf-space-head">
      <div className="hf-space-inner">
        {/* row 1 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div className="hf-crumb">
            <span className="hf-avatar">R</span>
            <div className="hf-title">
              <a href="#" className="owner">ruslanmv</a>
              <span className="slash">/</span>
              <span className="repo">matrixlab</span>
              <span className="copy" title="Copy name"><Ic d={I.copy} size={14} sw={2} /></span>
            </div>
            <span className="hf-badge" style={{ marginLeft: 4 }}>
              <Ic d={I.code} size={13} sw={2} /> Space
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="hf-badge like" onClick={() => setLiked(!liked)}
              style={liked ? { color: "#e11d48", borderColor: "#fecdd3", background: "#fff1f2" } : null}>
              <Ic d={I.heart} size={14} sw={2} style={{ fill: liked ? "#e11d48" : "none" }} /> like
              <span style={{ paddingLeft: 6, marginLeft: 6, borderLeft: "1px solid var(--hf-border)", fontWeight: 700 }}>{liked ? 129 : 128}</span>
            </button>
            <span className="hf-badge running"><span className="hf-dot" /> Running</span>
          </div>
        </div>

        {/* row 2: hardware / sdk meta */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <span className="hf-badge"><Ic d={<><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /></>} size={13} sw={1.8} /> CPU Basic · 2 vCPU · 16 GB</span>
          <span className="hf-badge" style={{ fontFamily: "var(--hf-mono)", fontSize: 11.5 }}>🐳 Docker</span>
          <span className="hf-badge" style={{ fontFamily: "var(--hf-mono)", fontSize: 11.5 }}>MIT</span>
          <span className="hf-badge" style={{ color: "var(--hf-ink-3)" }}>Updated 2 days ago</span>
        </div>

        {/* tabs */}
        <div className="hf-tabs">
          {tabs.map((t) => (
            <button key={t.id} className={"hf-tab" + (tab === t.id ? " active" : "")} onClick={() => setTab(t.id)}>
              <span className="ic" style={{ display: "inline-flex" }}><Ic d={t.ic} size={14} sw={2} /></span>
              {t.label}{t.count && <span className="count">{t.count}</span>}
            </button>
          ))}
          <div className="hf-tab-spacer">
            <button className="hf-icbtn" title="Restart"><Ic d={I.refresh} size={16} /></button>
            <button className="hf-icbtn" title="Embed"><Ic d={I.code} size={16} /></button>
            <button className="hf-icbtn" title="Open in new tab"><Ic d={I.expand} size={16} /></button>
            <button className="hf-icbtn" title="Settings" onClick={onSettings}><Ic d={I.gear} size={16} /></button>
            <button className="hf-icbtn" title="Settings" onClick={onSettings}><Ic d={I.dots} size={16} /></button>
          </div>
        </div>
      </div>
    </header>
  );
}

function FilesTab() {
  const files = [
    ["README.md", "2.4 kB", "📖"],
    ["Dockerfile", "612 B", "🐳"],
    ["app.py", "8.1 kB", "🐍"],
    ["matrix_cli/", "—", "📁"],
    ["requirements.txt", "284 B", "📄"],
    [".gitattributes", "1.5 kB", "⚙️"],
  ];
  return (
    <div style={{ border: "1px solid var(--hf-border)", borderRadius: "var(--hf-r-lg)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px",
        background: "var(--hf-bg-soft)", borderBottom: "1px solid var(--hf-border)", fontSize: 13.5, color: "var(--hf-ink-3)" }}>
        <span style={{ fontFamily: "var(--hf-mono)" }}><span style={{ color: "var(--hf-ink-2)", fontWeight: 600 }}>main</span> · 6 files</span>
        <span>matrixlab</span>
      </div>
      {files.map(([name, size, ic], i) => (
        <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: i < files.length - 1 ? "1px solid var(--hf-border)" : "none", fontSize: 14 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>{ic}</span>
            <span style={{ color: "var(--hf-link)", fontWeight: 600, fontFamily: "var(--hf-mono)", fontSize: 13.5 }}>{name}</span>
          </span>
          <span style={{ color: "var(--hf-ink-4)", fontFamily: "var(--hf-mono)", fontSize: 12.5 }}>{size}</span>
        </div>
      ))}
    </div>
  );
}

function CommunityTab() {
  const threads = [
    ["How do I add my own MCP server to the catalog?", "ruslanmv", "open", 4],
    ["Sandbox testing fails for private servers", "neo_ops", "open", 2],
    ["Feature: persist install history across sessions", "trinity", "closed", 7],
  ];
  return (
    <div style={{ border: "1px solid var(--hf-border)", borderRadius: "var(--hf-r-lg)", overflow: "hidden" }}>
      {threads.map(([title, who, status, n], i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px",
          borderBottom: i < threads.length - 1 ? "1px solid var(--hf-border)" : "none" }}>
          <span style={{ display: "inline-flex", color: status === "open" ? "var(--hf-green)" : "var(--hf-purple)" }}>
            <Ic d={I.chat} size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14.5, color: "var(--hf-ink)" }}>{title}</p>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--hf-ink-3)" }}>
              by <span style={{ color: "var(--hf-ink-2)", fontWeight: 600 }}>{who}</span> · {status}
            </p>
          </div>
          <span className="hf-badge">{n} 💬</span>
        </div>
      ))}
    </div>
  );
}

function HFToggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} role="switch" aria-checked={on}
      style={{ width: 40, height: 23, borderRadius: 99, padding: 2, flexShrink: 0, border: "none",
        background: on ? "var(--hf-green)" : "var(--hf-border-2)", transition: "background .15s ease", cursor: "pointer" }}>
      <span style={{ display: "block", width: 19, height: 19, borderRadius: 99, background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.25)", transform: on ? "translateX(17px)" : "translateX(0)",
        transition: "transform .15s ease" }} />
    </button>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--hf-ink-2)", marginBottom: 6 }}>{label}</span>
      {children}
      {hint && <span style={{ display: "block", fontSize: 12, color: "var(--hf-ink-4)", marginTop: 5 }}>{hint}</span>}
    </label>
  );
}

const HF_INPUT = {
  width: "100%", height: 40, padding: "0 12px", fontSize: 14, color: "var(--hf-ink)",
  background: "#fff", border: "1px solid var(--hf-border-2)", borderRadius: 8, outline: "none",
  fontFamily: "var(--hf-mono)",
};

const SETTINGS_DEFAULTS = {
  hubUrl: "https://api.matrixhub.io",
  token: "",
  workspace: "production",
  aliasPrefix: "",
  runnersDir: "~/.matrix/runners",
  port: "auto",
  autoApprove: false,
  streamOutput: true,
  plainChat: true,
  telemetry: false,
};

function HFSettings({ open, onClose }) {
  const [cfg, setCfg] = React.useState(SETTINGS_DEFAULTS);
  const [saved, setSaved] = React.useState(false);
  const set = (k, v) => { setCfg((c) => ({ ...c, [k]: v })); setSaved(false); };

  React.useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem("matrixlab-settings");
      if (raw) setCfg({ ...SETTINGS_DEFAULTS, ...JSON.parse(raw) });
    } catch (e) {}
    setSaved(false);
  }, [open]);

  React.useEffect(() => {
    function esc(e) { if (e.key === "Escape") onClose(); }
    if (open) window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  if (!open) return null;

  function save() {
    try { localStorage.setItem("matrixlab-settings", JSON.stringify(cfg)); } catch (e) {}
    setSaved(true);
    setTimeout(onClose, 650);
  }
  function reset() { setCfg(SETTINGS_DEFAULTS); setSaved(false); }

  const rowGap = { display: "grid", gap: 16 };

  return ReactDOM.createPortal(
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", alignItems: "flex-start",
        justifyContent: "center", padding: "6vh 16px 24px", background: "rgba(17,24,39,0.45)",
        backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", overflowY: "auto" }}>
      <div style={{ width: "100%", maxWidth: 560, background: "#fff", borderRadius: 16,
        border: "1px solid var(--hf-border)", boxShadow: "0 24px 70px rgba(16,24,40,0.28)", overflow: "hidden" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: "18px 22px", borderBottom: "1px solid var(--hf-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ display: "inline-flex", padding: 8, borderRadius: 9, background: "var(--hf-bg-mute)", color: "var(--hf-ink-2)" }}>
              <Ic d={I.gear} size={18} sw={2} />
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--hf-ink)" }}>MatrixLab settings</h2>
              <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--hf-ink-3)" }}>Configure the matrix CLI client for this Space</p>
            </div>
          </div>
          <button className="hf-icbtn" onClick={onClose} aria-label="Close"><Ic d={I.x} size={18} /></button>
        </div>

        {/* body */}
        <div className="hf-settings-body" style={{ padding: 22, display: "grid", gap: 24, maxHeight: "64vh", overflowY: "auto" }}>
          {/* connection */}
          <section style={rowGap}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--hf-ink-4)" }}>Connection</p>
            <Field label="Hub URL" hint="MatrixHub registry the client talks to.">
              <input style={HF_INPUT} value={cfg.hubUrl} onChange={(e) => set("hubUrl", e.target.value)} spellCheck={false} />
            </Field>
            <Field label="API token" hint="Stored locally in your browser — never sent anywhere else.">
              <input style={HF_INPUT} type="password" value={cfg.token} onChange={(e) => set("token", e.target.value)}
                placeholder="mx_••••••••••••••••" spellCheck={false} />
            </Field>
            <Field label="Workspace">
              <select style={{ ...HF_INPUT, fontFamily: "var(--hf-font)", cursor: "pointer" }} value={cfg.workspace}
                onChange={(e) => set("workspace", e.target.value)}>
                <option value="production">production</option>
                <option value="staging">staging</option>
                <option value="development">development</option>
              </select>
            </Field>
          </section>

          {/* runner */}
          <section style={rowGap}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--hf-ink-4)" }}>Runner</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 14 }} className="hf-settings-grid">
              <Field label="Runners directory">
                <input style={HF_INPUT} value={cfg.runnersDir} onChange={(e) => set("runnersDir", e.target.value)} spellCheck={false} />
              </Field>
              <Field label="Default port">
                <input style={HF_INPUT} value={cfg.port} onChange={(e) => set("port", e.target.value)} spellCheck={false} />
              </Field>
            </div>
            <Field label="Alias prefix" hint="Optional prefix applied to new install aliases.">
              <input style={HF_INPUT} value={cfg.aliasPrefix} onChange={(e) => set("aliasPrefix", e.target.value)}
                placeholder="e.g. dev-" spellCheck={false} />
            </Field>
          </section>

          {/* behavior */}
          <section style={{ display: "grid", gap: 4 }}>
            <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--hf-ink-4)" }}>Behavior</p>
            {[
              ["autoApprove", "Auto-approve installs", "Skip the admin approval gate on install."],
              ["streamOutput", "Stream command output", "Print results line-by-line as they arrive."],
              ["plainChat", "Plain-English chat", "Answer non-command input like a Matrix assistant."],
              ["telemetry", "Anonymous telemetry", "Share usage metrics to improve the catalog."],
            ].map(([key, label, hint]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 14, padding: "11px 0", borderTop: "1px solid var(--hf-border)" }}>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--hf-ink)" }}>{label}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--hf-ink-3)" }}>{hint}</p>
                </div>
                <HFToggle on={cfg[key]} onChange={(v) => set(key, v)} />
              </div>
            ))}
          </section>
        </div>

        {/* footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: "16px 22px", borderTop: "1px solid var(--hf-border)", background: "var(--hf-bg-soft)" }}>
          <button onClick={reset} className="hf-btn-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "var(--hf-ink-3)" }}>
            <Ic d={I.reset} size={15} /> Reset to defaults
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={onClose} className="hf-btn-ghost">Cancel</button>
            <button onClick={save} className="hf-btn-solid" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              {saved ? <><Ic d={I.check} size={15} sw={2.5} /> Saved</> : "Save settings"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Space() {
  const [tab, setTab] = React.useState("app");
  const [liked, setLiked] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  return (
    <React.Fragment>
      <TopNav />
      <SpaceHeader tab={tab} setTab={setTab} liked={liked} setLiked={setLiked} onSettings={() => setSettingsOpen(true)} />
      <main className="hf-app-wrap">
        {tab === "app" && (
          <React.Fragment>
            <div className="hf-app-bar">
              <span className="left">
                <span className="hf-dot" /> This Space is running <span style={{ color: "var(--hf-ink-4)" }}>· matrixlab</span>
              </span>
              <span className="sdk">matrix-cli 0.1.6 · sdk 0.1.9 · python 3.11+</span>
            </div>
            <div className="hf-app-frame">
              <HFConsole />
            </div>
            <div className="hf-footnote">
              <span className="pill">🐳 Built with Docker</span>
              <span className="pill"><span className="hf-dot" /> hub api.matrixhub.io · online</span>
              <span style={{ color: "var(--hf-ink-4)" }}>Tip: type <b style={{ fontFamily: "var(--hf-mono)" }}>matrix help</b>, or just ask in plain English.</span>
            </div>
          </React.Fragment>
        )}
        {tab === "files" && <FilesTab />}
        {tab === "community" && <CommunityTab />}
      </main>
      <HFSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("hf-root")).render(<Space />);
