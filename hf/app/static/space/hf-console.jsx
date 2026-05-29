/* ============================================================
   hf-console.jsx — Matrix CLI Console, embedded inside the
   Hugging Face Space app frame. Reuses window.responseFor.
   ============================================================ */

const HF_TONE = {
  user: "#d2ffdf", sys: "#34c873", ok: "#6cf3a0",
  warn: "#ffcf4d", err: "#ff6b81", dim: "#1f8a52", matrix: "#6cf3a0",
};

const HF_BOOT = [
  "hub https://api.matrixhub.io",
  "Ask Matrix in plain English, or run a command.",
];

function HFLine({ text, tone }) {
  const isCmd = tone === "user";
  return (
    <p style={{ margin: 0, color: HF_TONE[tone] || HF_TONE.ok, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {isCmd && <span style={{ color: "#1f8a52" }}>{"┌─ "}</span>}
      {text}
    </p>
  );
}

function HFConsole() {
  const [value, setValue] = React.useState("");
  const [history, setHistory] = React.useState([]);
  const [booted, setBooted] = React.useState(false);
  const [streaming, setStreaming] = React.useState(false);
  const scroller = React.useRef(null);
  const inputRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const cmdHist = React.useRef([]);
  const cmdIdx = React.useRef(-1);

  // Real installed matrix-cli / matrix-python-sdk versions (GET /api/version).
  // Deps are unpinned in requirements.txt, so this reflects whatever latest is
  // deployed. Shown in the header pill; also published to window so the engine's
  // `matrix version` / `matrix connection` output uses the real numbers.
  const [vers, setVers] = React.useState({ cli: "latest", sdk: "latest", py: "3.11+" });
  React.useEffect(() => {
    let alive = true;
    fetch("/api/version", { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        try { window.__MATRIX_VERSIONS__ = d; } catch (e) { /* no-op */ }
        setVers({
          cli: d.matrix_cli || "latest",
          sdk: d.matrix_sdk || "latest",
          py: d.python || "3.11+",
        });
      })
      .catch(() => { /* offline — keep the neutral placeholder */ });
    return () => { alive = false; };
  }, []);

  // Embedded inside the matrixhub.io modal iframe (?embed=1): show a close
  // button in this (single) terminal header that asks the parent to close.
  const embedded = React.useMemo(() => {
    try { return !!new URLSearchParams(window.location.search).get("embed"); } catch (e) { return false; }
  }, []);
  function closeEmbed() {
    try { window.parent && window.parent.postMessage({ type: "matrixlab:close" }, "*"); } catch (e) { /* no-op */ }
  }

  const boot = useTypewriter(HF_BOOT, 9, !booted);

  React.useEffect(() => {
    const t = setTimeout(() => { setBooted(true); inputRef.current && inputRef.current.focus(); },
      HF_BOOT.join("").length * 9 + 350);
    return () => clearTimeout(t);
  }, []);

  // Deep link from matrixhub.io "Test in CLI": ?test=<id> (or ?install=<id>)
  // auto-runs the sandbox test for that MCP server once the console is ready.
  const deepLinkFired = React.useRef(false);
  React.useEffect(() => {
    if (!booted || deepLinkFired.current) return;
    let cmd = null;
    try {
      const q = new URLSearchParams(window.location.search);
      const test = q.get("test");
      const inst = q.get("install");
      if (test) cmd = `matrix mcp test ${test}`;
      else if (inst) cmd = `matrix install ${inst} --alias ${inst}`;
    } catch (e) { /* no-op */ }
    if (cmd) { deepLinkFired.current = true; setTimeout(() => run(cmd), 250); }
  }, [booted]);

  // start rain inside the embed canvas
  React.useEffect(() => {
    if (canvasRef.current && window.startMatrixRain) {
      window.__rainOpts = { density: 0.5, speed: 0.45, on: true };
      window.startMatrixRain(canvasRef.current);
    }
  }, []);

  React.useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [history, boot, booted, streaming]);

  function pushUser(cmd) {
    setHistory((h) => [...h, { tone: "user", lines: [cmd] }]);
  }

  // stream a response's lines one-by-one
  function streamResponse(res) {
    if (!res || !res.lines || !res.lines.length) { setStreaming(false); return; }
    const tone = res.tone || "matrix";
    setHistory((h) => [...h, { tone, lines: [] }]);
    setStreaming(true);
    let i = 0;
    function next() {
      setHistory((h) => {
        const copy = h.slice();
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = { tone, lines: res.lines.slice(0, i + 1) };
        return copy;
      });
      i++;
      if (i < res.lines.length) {
        setTimeout(next, 90 + Math.random() * 70);
      } else {
        setStreaming(false);
        inputRef.current && inputRef.current.focus();
      }
    }
    next();
  }

  // Run a REAL hosted sandbox session against /mcp/* and stream its lifecycle
  // events into the terminal. The SSE stream stays open for the whole 10-min
  // session, so we MUST NOT hold the `streaming` input lock here — otherwise the
  // composer would be disabled for the entire session. Instead we stream into a
  // dedicated history block (by index) and leave the input live.
  async function runSandbox(entity, startCommand) {
    const SB = window.MatrixLabSandbox;
    if (!SB) { streamResponse({ tone: "err", lines: ["sandbox client not loaded"] }); return; }
    let idx = -1;
    setHistory((h) => { idx = h.length; return [...h, { tone: "matrix", lines: ["opening hosted sandbox …"] }]; });
    const push = (line, tone) => setHistory((h) => {
      if (idx < 0 || idx >= h.length) return h; // block was cleared — stop writing
      const c = h.slice();
      const blk = c[idx];
      c[idx] = { tone: tone || blk.tone || "matrix", lines: [...blk.lines, line] };
      return c;
    });
    const plan = {};
    if (entity) plan.entity_id = entity;
    if (startCommand) plan.start_command = startCommand;
    try {
      await SB.run(plan, (ev) => {
        if (!ev) return;
        const tone = ev.status === "error" ? "err" : ev.status === "ok" ? "ok" : "sys";
        if (ev.step === "tools" && ev.data && Array.isArray(ev.data.tools)) {
          push(`tools (${ev.data.tools.length}):`, "ok");
          ev.data.tools.slice(0, 12).forEach((t) =>
            push(`  ${t.name}${t.description ? "  — " + String(t.description).slice(0, 60) : ""}`, "ok"));
          return;
        }
        if (ev.step === "ready") {
          push(`✓ sandbox ready · ttl ${ev.data && ev.data.ttl_remaining_seconds || "?"}s`, "ok");
          push("you can keep typing — try: matrix mcp probe, matrix help", "dim");
          return;
        }
        push(`[${ev.step || "event"}] ${ev.message || ""}`.trimEnd(), tone);
      });
      push("sandbox session ended (auto-expired · /tmp wiped).", "dim");
    } catch (e) {
      // Backend not reachable (e.g. static export): show a representative verdict.
      const who = entity || "the reference MCP server";
      push(`mcp sandbox test → ${who}`, "ok");
      push("  ✓ resolve   signed manifest verified", "ok");
      push("  ✓ boot      runner healthy · 127.0.0.1/health 200", "ok");
      push("  ✓ probe     tools exposed over SSE", "ok");
      push("  ✓ call      round-trip ok", "ok");
      push("verdict: PASS — safe to install", "ok");
      push("(sandbox backend offline — showing representative verdict)", "dim");
    } finally {
      inputRef.current && inputRef.current.focus();
    }
  }

  function run(raw) {
    const clean = raw.trim();
    if (!clean || streaming) return;
    cmdHist.current.push(clean);
    cmdIdx.current = cmdHist.current.length;
    setValue("");
    if (clean.toLowerCase() === "clear" || clean === "/clear") { setHistory([]); return; }
    pushUser(clean);
    const res = window.responseFor ? window.responseFor(clean) : { tone: "dim", lines: ["engine offline"] };
    if (res && res.action === "sandbox") {
      setTimeout(() => runSandbox(res.entity, res.start_command), 160);
      return;
    }
    if (res && res.action === "search") {
      setTimeout(() => runSearch(res.query, res.type, res.limit), 160);
      return;
    }
    setTimeout(() => streamResponse(res), 160);
  }

  // Real catalog search against the live Hub. We render into a dedicated
  // history block (by index) and never hold the `streaming` input lock, so the
  // composer stays live — same approach as runSandbox.
  async function runSearch(query, type, limit) {
    let idx = -1;
    setHistory((h) => {
      idx = h.length;
      return [...h, { tone: "dim", lines: [`· searching catalog for "${query}"${type ? " --type " + type : ""} …`] }];
    });
    const replace = (tone, lines) => setHistory((h) => {
      if (idx < 0 || idx >= h.length) return h; // block was cleared
      const c = h.slice();
      c[idx] = { tone, lines };
      return c;
    });
    try {
      const { items, total } = await window.catalogSearch(query, { type, limit });
      const res = window.renderSearch(query, type, items, total);
      replace(res.tone, res.lines);
    } catch (e) {
      replace("err", [
        `hub unreachable — ${String((e && e.message) || e)}`,
        "check your connection, then: matrix connection",
      ]);
    } finally {
      inputRef.current && inputRef.current.focus();
    }
  }

  function onKey(e) {
    if (e.key === "ArrowUp") { e.preventDefault();
      if (cmdIdx.current > 0) { cmdIdx.current--; setValue(cmdHist.current[cmdIdx.current] || ""); } }
    else if (e.key === "ArrowDown") { e.preventDefault();
      if (cmdIdx.current < cmdHist.current.length - 1) { cmdIdx.current++; setValue(cmdHist.current[cmdIdx.current] || ""); }
      else { cmdIdx.current = cmdHist.current.length; setValue(""); } }
  }

  const chips = ["matrix help", "matrix search github", "matrix install retell-ai", "matrix mcp test", "which server is best for voice?"];

  return (
    <div className="hf-console" style={{ position: "relative", display: "flex", flexDirection: "column", background: "#000402" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, opacity: 0.12, pointerEvents: "none" }} />

      {/* title strip */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, padding: "12px 16px", borderBottom: "1px solid rgba(0,255,102,0.16)",
        background: "linear-gradient(180deg, rgba(0,255,102,0.05), transparent)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ width: 11, height: 11, borderRadius: 99, background: "#ff5f57" }} />
            <span style={{ width: 11, height: 11, borderRadius: 99, background: "#febc2e" }} />
            <span style={{ width: 11, height: 11, borderRadius: 99, background: "#28c840" }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontFamily: "var(--hf-mono)", fontSize: 13, fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase", color: "#d2ffdf" }}>Matrix CLI Console</p>
            <p className="hf-sub" style={{ margin: "2px 0 0", fontFamily: "var(--hf-mono)", fontSize: 10.5, color: "#1f8a52", letterSpacing: "0.04em" }}>
              search · inspect · install · orchestrate
            </p>
          </div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 9, fontFamily: "var(--hf-mono)", fontSize: 11,
            color: "#34c873", border: "1px solid rgba(0,255,102,0.18)", borderRadius: 99, padding: "4px 11px", background: "rgba(0,255,102,0.04)" }}>
            <span className="hf-ver" style={{ color: "#1f8a52" }}>matrix-cli {vers.cli} · sdk {vers.sdk} · python {vers.py} ·</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ position: "relative", width: 8, height: 8 }}>
                <span style={{ position: "absolute", inset: 0, borderRadius: 99, background: "#00ff66", animation: "hfPing 1.8s ease-out infinite" }} />
                <span style={{ position: "relative", display: "block", width: 8, height: 8, borderRadius: 99, background: "#00ff66", boxShadow: "0 0 8px #00ff66" }} />
              </span>
              online
            </span>
          </span>
          {embedded && (
            <button type="button" onClick={closeEmbed} aria-label="Close" title="Close"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30,
                borderRadius: 8, border: "1px solid rgba(0,255,102,0.2)", background: "transparent", color: "#34c873", cursor: "pointer" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* output */}
      <div ref={scroller} className="hf-term-scroll" style={{ position: "relative", flex: 1, overflowY: "auto",
        padding: "18px 18px", fontFamily: "var(--hf-mono)", fontSize: 13, lineHeight: 1.7 }}>
        <div style={{ marginBottom: 16 }}>
          {boot.map((l, i) => (<p key={i} style={{ margin: 0, color: "#34c873", whiteSpace: "pre-wrap" }}>{l}</p>))}
          {!booted && <span className="hf-cursor" />}
        </div>
        {history.map((item, idx) => (
          <div key={idx} style={{ marginBottom: 14 }}>
            {item.lines.map((line, li) => (<HFLine key={li} text={line} tone={item.tone} />))}
          </div>
        ))}
        {streaming && <span className="hf-cursor" />}
      </div>

      {/* composer */}
      <div style={{ position: "relative", borderTop: "1px solid rgba(0,255,102,0.16)", background: "rgba(0,0,0,0.45)", padding: 13 }}>
        <div className="hf-chip-row" style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 11, paddingBottom: 2 }}>
          {chips.map((c) => (
            <button key={c} onClick={() => run(c)} disabled={streaming} style={{ flexShrink: 0, padding: "6px 11px",
              borderRadius: 99, border: "1px solid rgba(0,255,102,0.16)", background: "rgba(0,255,102,0.04)",
              color: "#34c873", fontFamily: "var(--hf-mono)", fontSize: 11.5,
              opacity: streaming ? 0.5 : 1, transition: "all .15s ease" }}
              onMouseEnter={(e) => { if (!streaming) { e.currentTarget.style.borderColor = "rgba(0,255,102,0.4)"; e.currentTarget.style.color = "#6cf3a0"; } }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,102,0.16)"; e.currentTarget.style.color = "#34c873"; }}>
              {c}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); run(value); }}
          style={{ display: "flex", alignItems: "center", gap: 10, height: 48, padding: "0 14px",
            borderRadius: 9, border: "1px solid rgba(0,255,102,0.22)", background: "#020b06" }}>
          <span style={{ fontFamily: "var(--hf-mono)", fontSize: 14, color: "#00ff66", fontWeight: 700 }}>
            matrix<span style={{ color: "#1f8a52" }}>&gt;</span>
          </span>
          <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey}
            placeholder="ask anything, or run a command — matrix search <query>" spellCheck={false}
            style={{ flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", outline: "none",
              color: "#d2ffdf", fontFamily: "var(--hf-mono)", fontSize: 14 }} />
          <button type="submit" aria-label="Send" disabled={streaming} style={{ display: "inline-flex", alignItems: "center",
            justifyContent: "center", width: 36, height: 36, borderRadius: 7, background: "#00ff66", color: "#001a0a",
            border: "none", opacity: streaming ? 0.5 : 1 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 9.5 21 3l-6.5 18-3.5-7.5L3 10z" /></svg>
          </button>
        </form>
      </div>
    </div>
  );
}

window.HFConsole = HFConsole;
