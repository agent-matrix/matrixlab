/* ============================================================
   sandbox.jsx — MatrixLab sandbox client + "Enable sandbox" button

   This is the reusable piece intended to later drop into
   matrixhub.io. It does two things:

   1. window.MatrixLabSandbox — a tiny, framework-agnostic client
      for the MatrixLab HF Space MCP sandbox API (/mcp/*):
        .health()                     -> capacity / availability
        .startSession(plan)           -> POST /mcp/sessions
        .streamEvents(id, onEvent)    -> SSE /mcp/sessions/{id}/events
        .listTools(id)                -> GET  /mcp/sessions/{id}/tools
        .callTool(id, name, args)     -> POST /mcp/sessions/{id}/tools/call
        .stop(id)                     -> DELETE /mcp/sessions/{id}
        .run(plan, onEvent)           -> full start->stream->tools flow

   2. <SandboxButton> (React) + window.mountSandboxButton(el, opts)
      — a simple toggle that enables/disables "sandbox mode" and
      reflects live availability from /mcp/health. matrixhub.io can
      embed it with one call:

        MatrixLabSandbox.configure({ baseUrl: "https://ruslanmv-matrixlab.hf.space" });
        mountSandboxButton(document.getElementById("sbx"), {
          onChange: (on) => { ... }
        });

   The button is intentionally dependency-free at the data layer so
   it works inside the HF Space (same-origin) today and inside
   matrixhub.io (cross-origin, with a proxy/token) later.
   ============================================================ */

(function () {
  // ---- config -------------------------------------------------------------
  const CONFIG = {
    // "" => same-origin (the HF Space serving this page). matrixhub.io
    // should set this to the Space URL or to its own proxy base.
    baseUrl: "",
    // Optional bearer token. Same-origin Space usually leaves this empty
    // (the Space enforces its own MATRIXLAB_SANDBOX_TOKEN server-side).
    token: "",
    // Optional async token provider (preferred for matrixhub.io).
    getToken: null,
    // Default plan used by the console "Test in sandbox" affordance.
    // A safe, curated reference MCP server that lists tools without secrets.
    defaultPlan: {
      entity_id: "mcp_server:filesystem",
      runtime: "node",
      start_command: "npx -y @modelcontextprotocol/server-filesystem /tmp",
      transport: "stdio",
      ttl_seconds: 600, // 10-minute trial sandbox, then auto-shutdown
    },
  };

  function configure(opts) {
    Object.assign(CONFIG, opts || {});
    return CONFIG;
  }

  function url(path) {
    const base = (CONFIG.baseUrl || "").replace(/\/$/, "");
    return base + path;
  }

  async function headers(extra) {
    const h = Object.assign({ "Content-Type": "application/json" }, extra || {});
    let tok = CONFIG.token;
    if (!tok && typeof CONFIG.getToken === "function") {
      try { tok = await CONFIG.getToken(); } catch (e) { /* ignore */ }
    }
    if (tok) h["Authorization"] = "Bearer " + tok;
    return h;
  }

  // ---- low-level API ------------------------------------------------------
  async function health() {
    const res = await fetch(url("/mcp/health"), { headers: await headers() });
    if (!res.ok) throw new Error("sandbox health " + res.status);
    return res.json();
  }

  async function startSession(plan) {
    const body = Object.assign({}, CONFIG.defaultPlan, plan || {});
    const res = await fetch(url("/mcp/sessions"), {
      method: "POST",
      headers: await headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error("start " + res.status + (txt ? " — " + txt.slice(0, 200) : ""));
    }
    return res.json();
  }

  async function listTools(id) {
    const res = await fetch(url("/mcp/sessions/" + id + "/tools"), { headers: await headers() });
    if (!res.ok) throw new Error("tools " + res.status);
    return res.json();
  }

  async function callTool(id, name, args) {
    const res = await fetch(url("/mcp/sessions/" + id + "/tools/call"), {
      method: "POST",
      headers: await headers(),
      body: JSON.stringify({ name: name, arguments: args || {} }),
    });
    if (!res.ok) throw new Error("call " + res.status);
    return res.json();
  }

  async function stop(id) {
    const res = await fetch(url("/mcp/sessions/" + id), {
      method: "DELETE",
      headers: await headers(),
    });
    return res.ok ? res.json() : { ok: false };
  }

  // Stream lifecycle events. EventSource cannot set Authorization headers,
  // so we read the SSE body via fetch + a stream reader (works same-origin,
  // and cross-origin when CORS is allowed). Returns an abort handle.
  async function streamEvents(id, onEvent, onDone) {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(url("/mcp/sessions/" + id + "/events"), {
          headers: await headers({ Accept: "text/event-stream" }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error("events " + res.status);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const isDone = /(^|\n)event:\s*done/.test(chunk);
            const m = chunk.match(/(^|\n)data:\s*(.*)$/);
            if (m && m[2]) {
              try { onEvent && onEvent(JSON.parse(m[2]), isDone); } catch (e) { /* keep-alive */ }
            }
            if (isDone) { onDone && onDone(); return; }
          }
        }
        onDone && onDone();
      } catch (e) {
        if (e.name !== "AbortError") onEvent && onEvent({ step: "stream", status: "error", message: String(e.message || e) });
        onDone && onDone();
      }
    })();
    return { abort: () => controller.abort() };
  }

  // High-level: start a session, stream its lifecycle, surface tools when ready.
  // onEvent receives { step, status, message, data }. Resolves with the session.
  async function run(plan, onEvent) {
    const session = await startSession(plan);
    const id = session.session_id;
    onEvent && onEvent({ step: "session", status: "ok", message: "session " + id, data: session });
    await new Promise((resolve) => {
      streamEvents(id, (ev, isDone) => {
        onEvent && onEvent(ev);
        if (ev && ev.step === "ready" && ev.status === "ok") {
          listTools(id)
            .then((t) => onEvent && onEvent({ step: "tools", status: "ok", message: (t.tools || []).length + " tools", data: t }))
            .catch(() => {});
        }
        if (isDone) resolve();
      }, resolve);
    });
    return session;
  }

  window.MatrixLabSandbox = {
    configure, health, startSession, listTools, callTool, stop, streamEvents, run,
    get config() { return CONFIG; },
  };

  // ---- the "Enable sandbox" button ---------------------------------------
  // A simple toggle that probes availability and flips sandbox mode.
  function SandboxButton({ on, onChange, compact }) {
    const [avail, setAvail] = React.useState(null); // null=unknown, true/false
    const [info, setInfo] = React.useState(null);
    const [busy, setBusy] = React.useState(false);

    const probe = React.useCallback(() => {
      setBusy(true);
      health()
        .then((h) => { setAvail(true); setInfo(h); })
        .catch(() => { setAvail(false); setInfo(null); })
        .finally(() => setBusy(false));
    }, []);

    React.useEffect(() => { probe(); }, [probe]);
    React.useEffect(() => {
      if (!on) return;
      const t = setInterval(probe, 15000);
      return () => clearInterval(t);
    }, [on, probe]);

    const capacity = info ? (info.max_sessions - (info.active_sessions || 0)) : null;
    const full = capacity !== null && capacity <= 0;
    const disabled = busy || avail === false || full;

    const dotColor = avail === false ? "#ff6b81" : on ? "#00ff66" : "#34c873";
    const label = avail === false
      ? "sandbox offline"
      : on
        ? (full ? "sandbox full" : "sandbox on")
        : "enable sandbox";

    const title = avail === false
      ? "The MatrixLab sandbox worker is not reachable."
      : info
        ? `Sandbox ${info.active_sessions || 0}/${info.max_sessions} sessions · TTL ${info.max_ttl_seconds}s`
        : "Trial an MCP server in a throwaway sandbox before you install.";

    function toggle() {
      if (avail === false) { probe(); return; }
      onChange && onChange(!on);
    }

    return (
      <button
        type="button"
        onClick={toggle}
        disabled={disabled && !on}
        title={title}
        aria-pressed={on}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap",
          padding: compact ? "5px 10px" : "6px 12px",
          fontFamily: "var(--hf-mono, ui-monospace, monospace)",
          fontSize: compact ? 11.5 : 12.5, fontWeight: 700, letterSpacing: "0.02em",
          borderRadius: 8, cursor: disabled && !on ? "not-allowed" : "pointer",
          color: on ? "#001a0a" : "#0b3d23",
          background: on ? "#00ff66" : "rgba(0,255,102,0.10)",
          border: "1px solid " + (on ? "#00ff66" : "rgba(0,255,102,0.45)"),
          boxShadow: on ? "0 0 14px rgba(0,255,102,0.45)" : "none",
          opacity: disabled && !on ? 0.6 : 1, transition: "all .15s ease",
        }}>
        <span style={{ position: "relative", width: 8, height: 8 }}>
          <span style={{ position: "absolute", inset: 0, borderRadius: 99, background: dotColor,
            boxShadow: "0 0 8px " + dotColor }} />
          {on && avail !== false && (
            <span style={{ position: "absolute", inset: 0, borderRadius: 99, background: dotColor,
              animation: "hfPing 1.8s ease-out infinite" }} />
          )}
        </span>
        {busy ? "checking…" : label}
        {info && on && !full && (
          <span style={{ opacity: 0.7, fontWeight: 600 }}>· {capacity} free</span>
        )}
      </button>
    );
  }
  window.SandboxButton = SandboxButton;

  // Framework-agnostic mount so non-React hosts (matrixhub.io) can embed it.
  window.mountSandboxButton = function (el, opts) {
    opts = opts || {};
    if (opts.baseUrl || opts.token || opts.getToken) configure(opts);
    let on = !!opts.defaultOn;
    const root = ReactDOM.createRoot(el);
    function render() {
      root.render(React.createElement(SandboxButton, {
        on: on, compact: opts.compact,
        onChange: (v) => { on = v; render(); opts.onChange && opts.onChange(v); },
      }));
    }
    render();
    return { setOn: (v) => { on = v; render(); }, unmount: () => root.unmount() };
  };
})();
