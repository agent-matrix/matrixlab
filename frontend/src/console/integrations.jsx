import React, { useState } from "react";
import { Icon, Pill } from "./shared.jsx";

// ---- Integration catalog ----
const INTEGRATIONS = [
  {
    id: "gitpilot",
    name: "GitPilot",
    vendor: "ruslanmv",
    tagline: "Agentic GitHub assistant — runs all repo edits and tests inside MatrixLab.",
    description: "GitPilot delegates every shell command, test run, and AI-generated change to MatrixLab via POST /repo/run. With this integration, MatrixLab becomes GitPilot's enterprise execution backbone.",
    status: "connected",
    health: "healthy",
    glyph: "GP",
    glyphBg: "linear-gradient(135deg, #0f7a73, #2563eb)",
    category: "Agent runtime",
    docs: "github.com/ruslanmv/gitpilot",
    featured: true,
    stats: { runsToday: 287, errorRate: "1.4%", avgDuration: "3.2s", lastCall: "12s ago" },
  },
  {
    id: "agent-generator",
    name: "Agent Generator",
    vendor: "ruslanmv",
    tagline: "Generate production-ready multi-agent projects with built-in sandbox verification.",
    description: "Uses MatrixLab's /repo/run profile to verify generated CrewAI / LangGraph / Watsonx projects.",
    status: "connected",
    health: "healthy",
    glyph: "AG",
    glyphBg: "linear-gradient(135deg, #7c3aed, #db2777)",
    category: "Agent runtime",
    docs: "github.com/ruslanmv/agent-generator",
    stats: { runsToday: 41, errorRate: "0%", avgDuration: "9.4s", lastCall: "4m ago" },
  },
  {
    id: "repoguardian",
    name: "RepoGuardian",
    vendor: "ruslanmv",
    tagline: "Autonomous repository health verification and AI-assisted repair.",
    description: "RepoGuardian uses cached environments to test repair candidates branch-by-branch.",
    status: "connected",
    health: "warning",
    glyph: "RG",
    glyphBg: "linear-gradient(135deg, #157f4a, #0f7a73)",
    category: "Code review",
    docs: "github.com/ruslanmv/RepoGuardian",
    stats: { runsToday: 18, errorRate: "11%", avgDuration: "22.0s", lastCall: "1h ago" },
  },
  {
    id: "mcp-gateway",
    name: "MCP Context Forge",
    vendor: "ruslanmv",
    tagline: "Model Context Protocol gateway & registry.",
    description: "Exposes MatrixLab as an MCP tool — agents call sandbox.run as a typed tool.",
    status: "available",
    glyph: "MC",
    glyphBg: "linear-gradient(135deg, #2563eb, #0ea5e9)",
    category: "Protocol",
    docs: "github.com/ruslanmv/mcp-context-forge",
  },
  {
    id: "hf-spaces",
    name: "Hugging Face Spaces",
    vendor: "Hugging Face",
    tagline: "Run MatrixLab as a Space backend for remote repo maintenance.",
    description: "Deploy hf/ as a Space and delegate execution to a private MatrixLab Runner.",
    status: "available",
    glyph: "HF",
    glyphBg: "linear-gradient(135deg, #f59e0b, #dc2626)",
    category: "Deployment",
    docs: "huggingface.co/spaces",
  },
  {
    id: "matrix-hub",
    name: "Matrix Hub",
    vendor: "agent-matrix",
    tagline: "Catalog and installer service for AI agents, tools, and MCP servers.",
    description: "Test catalog manifests by running their install plan inside a MatrixLab sandbox.",
    status: "available",
    glyph: "MH",
    glyphBg: "linear-gradient(135deg, #0f172a, #475569)",
    category: "Catalog",
    docs: "github.com/agent-matrix/matrix-hub",
  },
  {
    id: "gh-actions",
    name: "GitHub Actions",
    vendor: "GitHub",
    tagline: "Use MatrixLab as a self-hosted runner for untrusted PR workflows.",
    description: "Send pull-request CI jobs through MatrixLab and get artifacts back into the PR check.",
    status: "available",
    glyph: "GH",
    glyphBg: "linear-gradient(135deg, #1f2937, #0f172a)",
    category: "CI/CD",
    docs: "github.com/features/actions",
  },
  {
    id: "slack",
    name: "Slack",
    vendor: "Slack",
    tagline: "Notify on run failures and high-risk policy events.",
    description: "Channel webhooks for run failures, timeouts, and security policy violations.",
    status: "available",
    glyph: "SL",
    glyphBg: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    category: "Notifications",
    docs: "api.slack.com",
  },
];

// ---- Sample activity from GitPilot ----
const gpActivity = [
  { ts: "10:52:14", sandbox: "ml-2026-05-15-a83c2f", cmd: "pytest -q tests/", repo: "ruslanmv/gitpilot", branch: "feature/login", exit: 0, ms: 4321, status: "ok" },
  { ts: "10:51:02", sandbox: "ml-2026-05-15-9b1de4", cmd: "python -m compileall .", repo: "ruslanmv/gitpilot", branch: "feature/login", exit: 0, ms: 1820, status: "ok" },
  { ts: "10:48:55", sandbox: "ml-2026-05-15-71aab9", cmd: "ruff check src/", repo: "ruslanmv/gitpilot", branch: "feature/login", exit: 1, ms: 980, status: "fail" },
  { ts: "10:45:17", sandbox: "ml-2026-05-15-c0d8e1", cmd: "pytest -q tests/test_api.py", repo: "ruslanmv/gitpilot", branch: "main", exit: 0, ms: 3104, status: "ok" },
  { ts: "10:42:09", sandbox: "ml-2026-05-15-44e2f0", cmd: "python -m mypy src/", repo: "ruslanmv/gitpilot", branch: "main", exit: 0, ms: 7822, status: "ok" },
  { ts: "10:38:41", sandbox: "ml-2026-05-15-2f9c08", cmd: "pip install -e .[test]", repo: "ruslanmv/gitpilot", branch: "feature/login", exit: 0, ms: 12410, status: "ok" },
  { ts: "10:36:22", sandbox: "ml-2026-05-15-8aa771", cmd: "pytest -q -k oauth", repo: "ruslanmv/gitpilot", branch: "feature/login", exit: 124, ms: 120000, status: "timeout" },
];

// ---- Integrations index page ----
function Integrations({ navigate }) {
  const [open, setOpen] = useState(null);

  if (open) {
    const integ = INTEGRATIONS.find(i => i.id === open);
    return <IntegrationDetail integ={integ} back={() => setOpen(null)} navigate={navigate}/>;
  }

  const connected = INTEGRATIONS.filter(i => i.status === "connected");
  const available = INTEGRATIONS.filter(i => i.status === "available");

  return (
    <div className="content wide">
      <div className="page-head">
        <div>
          <h1 className="page-title">Integrations</h1>
          <p className="page-sub">Applications that delegate execution to MatrixLab. Connect a tool to route its runs, edits, and tests through your sandboxed runtime.</p>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="folder"/> Browse marketplace</button>
          <button className="btn btn-primary"><Icon name="plus"/> Add custom</button>
        </div>
      </div>

      {/* Featured banner — GitPilot */}
      <FeaturedBanner onOpen={() => setOpen("gitpilot")}/>

      <h3 style={{ margin: "24px 0 10px", fontSize: 13.5, fontWeight: 600 }}>
        Connected <span style={{ color: "var(--ml-text-3)", fontWeight: 500, marginLeft: 6 }}>· {connected.length}</span>
      </h3>
      <div className="grid-3">
        {connected.map(i => <IntegrationCard key={i.id} integ={i} onOpen={() => setOpen(i.id)}/>)}
      </div>

      <h3 style={{ margin: "28px 0 10px", fontSize: 13.5, fontWeight: 600 }}>
        Available
        <span style={{ color: "var(--ml-text-3)", fontWeight: 500, marginLeft: 6 }}>· {available.length}</span>
      </h3>
      <div className="grid-3">
        {available.map(i => <IntegrationCard key={i.id} integ={i} onOpen={() => setOpen(i.id)}/>)}
      </div>
    </div>
  );
}

function FeaturedBanner({ onOpen }) {
  return (
    <div className="card" style={{
      background: "linear-gradient(120deg, var(--ml-surface) 0%, var(--ml-accent-soft) 100%)",
      borderColor: "var(--ml-accent-soft)",
      padding: 0,
      overflow: "hidden",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 0, alignItems: "stretch" }}>
        <div style={{ padding: "22px 26px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <Pill tone="success">Connected</Pill>
            <span style={{ fontSize: 11.5, color: "var(--ml-text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Featured integration</span>
          </div>
          <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
            GitPilot runs on MatrixLab
          </h2>
          <p style={{ margin: "0 0 16px", color: "var(--ml-text-2)", maxWidth: 560 }}>
            Every shell command, test execution, and AI‑generated change in GitPilot is delegated to MatrixLab through a single endpoint contract: <span className="mono" style={{ background: "rgba(15,122,115,0.10)", padding: "1px 6px", borderRadius: 4 }}>POST /repo/run</span>.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={onOpen}>Open integration</button>
            <button className="btn">View contract</button>
          </div>
        </div>
        <div style={{ padding: 22, borderLeft: "1px solid var(--ml-border)", background: "var(--ml-surface)", display: "flex", flexDirection: "column", gap: 12, justifyContent: "center" }}>
          <MiniStat label="Runs today (GitPilot)" value="287" tone="success" hint="98.6% success"/>
          <MiniStat label="Avg duration" value="3.2s" hint="across 287 calls"/>
          <MiniStat label="Last call" value="12s ago" hint="ml-2026-05-15-a83c2f"/>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, hint, tone }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: "var(--ml-text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, marginTop: 2, color: tone === "success" ? "var(--ml-success)" : "var(--ml-text)" }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--ml-text-3)" }}>{hint}</div>
    </div>
  );
}

function IntegrationCard({ integ, onOpen }) {
  const isConnected = integ.status === "connected";
  return (
    <div className="card card-pad" style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 12 }}
         onClick={onOpen}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div className="int-glyph" style={{ background: integ.glyphBg }}>{integ.glyph}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{integ.name}</span>
            {isConnected ? (
              <Pill tone={integ.health === "healthy" ? "success" : "warn"}>
                {integ.health === "healthy" ? "Connected" : "Needs attention"}
              </Pill>
            ) : (
              <Pill tone="neutral">Available</Pill>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--ml-text-3)" }}>
            {integ.vendor} · {integ.category}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: "var(--ml-text-2)", lineHeight: 1.5 }}>
        {integ.tagline}
      </div>
      {isConnected && integ.stats && (
        <div style={{ display: "flex", gap: 14, padding: "10px 0 0", borderTop: "1px solid var(--ml-border)", fontSize: 12 }}>
          <div><div style={{ color: "var(--ml-text-3)" }}>Runs/24h</div><div style={{ fontWeight: 600 }}>{integ.stats.runsToday}</div></div>
          <div><div style={{ color: "var(--ml-text-3)" }}>Errors</div><div style={{ fontWeight: 600 }}>{integ.stats.errorRate}</div></div>
          <div><div style={{ color: "var(--ml-text-3)" }}>Avg</div><div style={{ fontWeight: 600 }}>{integ.stats.avgDuration}</div></div>
        </div>
      )}
      <div style={{ marginTop: "auto", display: "flex", gap: 6 }}>
        {isConnected ? (
          <>
            <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); onOpen(); }}>Configure</button>
            <button className="btn btn-sm">View activity</button>
          </>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
            <Icon name="plus" size={12}/> Connect
          </button>
        )}
      </div>
    </div>
  );
}

// ---- Detail view ----
function IntegrationDetail({ integ, back }) {
  const [tab, setTab] = useState("overview");
  if (!integ) return null;
  return (
    <div className="content wide">
      <div className="page-head" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <button className="btn btn-ghost btn-sm" onClick={back}>
            <Icon name="chevL" size={14}/> All integrations
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8 }}>
            <div className="int-glyph" style={{ background: integ.glyphBg, width: 44, height: 44, fontSize: 15, borderRadius: 10 }}>{integ.glyph}</div>
            <div>
              <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {integ.name}
                {integ.status === "connected"
                  ? <Pill tone={integ.health === "healthy" ? "success" : "warn"}>{integ.health === "healthy" ? "Connected" : "Needs attention"}</Pill>
                  : <Pill tone="neutral">Available</Pill>}
              </h1>
              <p className="page-sub">{integ.vendor} · {integ.category} · {integ.docs}</p>
            </div>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="refresh" size={14}/> Test connection</button>
          {integ.status === "connected"
            ? <button className="btn btn-danger">Disconnect</button>
            : <button className="btn btn-primary">Connect</button>}
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>Overview</button>
        <button className={`tab ${tab === "config" ? "active" : ""}`} onClick={() => setTab("config")}>Configuration</button>
        <button className={`tab ${tab === "contract" ? "active" : ""}`} onClick={() => setTab("contract")}>Endpoints</button>
        <button className={`tab ${tab === "activity" ? "active" : ""}`} onClick={() => setTab("activity")}>
          Activity {integ.id === "gitpilot" && <span className="count">{gpActivity.length}</span>}
        </button>
        <button className={`tab ${tab === "policy" ? "active" : ""}`} onClick={() => setTab("policy")}>Policy</button>
      </div>

      {tab === "overview" && <OverviewTab integ={integ}/>}
      {tab === "config"   && <ConfigTab integ={integ}/>}
      {tab === "contract" && <ContractTab integ={integ}/>}
      {tab === "activity" && <ActivityTab integ={integ}/>}
      {tab === "policy"   && <PolicyTab integ={integ}/>}
    </div>
  );
}

// ---- Overview ----
function OverviewTab({ integ }) {
  const isGP = integ.id === "gitpilot";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="card card-pad">
          <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>What this integration does</h3>
          <p style={{ margin: 0, color: "var(--ml-text-2)", lineHeight: 1.6 }}>{integ.description}</p>
        </div>

        {isGP && (
          <div className="card card-pad">
            <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>How it works</h3>
            <FlowDiagram/>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
              <Step n="1" label="GitPilot's agent generates a plan and a shell command."/>
              <Step n="2" label="It calls MatrixLab POST /repo/run with cmd, cwd, env, image, allow_network."/>
              <Step n="3" label="MatrixLab provisions a fresh sandbox, runs the command, captures stdout/stderr."/>
              <Step n="4" label="MatrixLab returns { exit_code, stdout, stderr, duration_ms, artifacts, sandbox_id }."/>
              <Step n="5" label="GitPilot surfaces the result in its UI and decides whether to apply the change."/>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Connection status</h3>
          <Pill tone={integ.health === "healthy" ? "success" : "warn"}>
            {integ.health === "healthy" ? "Healthy" : "Degraded"}
          </Pill>
        </div>
        <div className="card-pad">
          <div className="kv">
            <div className="k">Endpoint</div><div className="v mono">http://localhost:8000</div>
            <div className="k">Auth</div><div className="v"><Pill tone="info">Bearer token</Pill></div>
            <div className="k">Token subject</div><div className="v mono">gitpilot-prod</div>
            <div className="k">Protocol</div><div className="v mono">matrixlab.runner.v1</div>
            <div className="k">Last health check</div><div className="v">4s ago · ok=true</div>
            <div className="k">Uptime</div><div className="v">9h 35m</div>
            <div className="k">Image cache</div><div className="v" style={{ fontSize: 12 }}>
              <span className="mono">python:3.11-slim</span>, <span className="mono">node:20</span>
            </div>
          </div>
          {integ.id === "repoguardian" && (
            <div style={{ marginTop: 14, padding: "10px 12px", background: "var(--ml-warning-soft)", color: "var(--ml-warning)", borderRadius: 6, fontSize: 12.5 }}>
              <Icon name="info" size={13}/>&nbsp; Elevated error rate detected in last hour — 11% of runs failed. Review activity tab.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Step({ n, label }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{
        width: 20, height: 20, borderRadius: "50%",
        background: "var(--ml-accent-soft)", color: "var(--ml-accent)",
        display: "grid", placeItems: "center", fontSize: 11.5, fontWeight: 600,
        flexShrink: 0,
      }}>{n}</span>
      <span style={{ color: "var(--ml-text-2)" }}>{label}</span>
    </div>
  );
}

function FlowDiagram() {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 28px 1fr 28px 1fr",
      alignItems: "center",
      gap: 4,
      padding: "12px 4px",
    }}>
      <FlowNode title="GitPilot" sub="Agent + UI" tone="indigo"/>
      <Arrow label="POST /repo/run"/>
      <FlowNode title="MatrixLab Runner" sub="matrixlab.runner.v1" tone="teal"/>
      <Arrow label="exec"/>
      <FlowNode title="Sandbox" sub="ephemeral container" tone="slate"/>
    </div>
  );
}

function FlowNode({ title, sub, tone }) {
  const bgs = {
    indigo: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    teal:   "linear-gradient(135deg, #0f7a73, #0ea5e9)",
    slate:  "linear-gradient(135deg, #475569, #0f172a)",
  };
  return (
    <div style={{
      padding: "12px 12px",
      borderRadius: 10,
      background: "var(--ml-surface)",
      border: "1px solid var(--ml-border)",
      textAlign: "center",
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 7,
        background: bgs[tone], margin: "0 auto 6px",
      }}/>
      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 11, color: "var(--ml-text-3)" }}>{sub}</div>
    </div>
  );
}
function Arrow({ label }) {
  return (
    <div style={{ position: "relative", height: 28 }}>
      <div style={{ position: "absolute", top: "50%", left: 0, right: 6, height: 1, background: "var(--ml-border-strong)" }}/>
      <div style={{ position: "absolute", top: "50%", right: 0, transform: "translateY(-50%)", width: 0, height: 0,
        borderLeft: "6px solid var(--ml-border-strong)", borderTop: "4px solid transparent", borderBottom: "4px solid transparent" }}/>
      {label && <div style={{ position: "absolute", left: "50%", top: -12, transform: "translateX(-50%)",
        fontSize: 10, color: "var(--ml-text-3)", fontFamily: "var(--ml-mono)",
        background: "var(--ml-surface)", padding: "0 4px" }}>{label}</div>}
    </div>
  );
}

// ---- Configuration ----
function ConfigTab({ integ }) {
  const isGP = integ.id === "gitpilot";
  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h3 style={{ margin: 0, fontSize: 14 }}>Connection</h3>
      <div className="grid-2">
        <div className="field">
          <label>MatrixLab Runner URL</label>
          <input className="input" defaultValue="http://localhost:8000"/>
          <span className="hint">The endpoint GitPilot will POST to via GITPILOT_MATRIXLAB_URL.</span>
        </div>
        <div className="field">
          <label>Bearer token</label>
          <input className="input" type="password" defaultValue="••••••••••••••••"/>
          <span className="hint">Sent as Authorization header. Rotate by restart.</span>
        </div>
      </div>

      <div className="divider"/>
      <h3 style={{ margin: 0, fontSize: 14 }}>Runtime defaults</h3>
      <div className="grid-2">
        <div className="field">
          <label>Default image</label>
          <select className="select" defaultValue="python:3.11-slim">
            <option>python:3.11-slim</option>
            <option>node:20</option>
            <option>golang:1.22</option>
            <option>rust:1.78</option>
          </select>
        </div>
        <div className="field">
          <label>Default network</label>
          <div className="segmented">
            <button className="on">Off — safest</button>
            <button>Allowlist egress</button>
          </div>
        </div>
        <div className="field">
          <label>Default timeout</label>
          <div className="segmented">
            {[60, 120, 300, 600].map(s => <button key={s} className={s === 120 ? "on" : ""}>{s >= 60 ? `${s/60}m` : `${s}s`}</button>)}
          </div>
        </div>
        <div className="field">
          <label>Max timeout (cap)</label>
          <input className="input" defaultValue="600"/>
          <span className="hint">Hard ceiling — overrides client requests above this.</span>
        </div>
      </div>

      <div className="divider"/>
      <h3 style={{ margin: 0, fontSize: 14 }}>Resource ceilings</h3>
      <div className="grid-3">
        <div className="field">
          <label>CPU cores</label>
          <input className="input" defaultValue="2"/>
        </div>
        <div className="field">
          <label>Memory (MiB)</label>
          <input className="input" defaultValue="1024"/>
        </div>
        <div className="field">
          <label>Disk (MiB)</label>
          <input className="input" defaultValue="1024"/>
        </div>
      </div>

      {isGP && <>
        <div className="divider"/>
        <h3 style={{ margin: 0, fontSize: 14 }}>Allowed images</h3>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--ml-text-3)" }}>
          If set, restricts what {integ.name} can request. Leave empty to allow any image.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {["python:3.11-slim", "node:20", "golang:1.22", "rust:1.78"].map(img => (
            <span key={img} className="filter-chip on" style={{ paddingRight: 4 }}>
              <span className="mono" style={{ fontSize: 11.5 }}>{img}</span>
              <button className="btn btn-ghost btn-sm" style={{ padding: 2 }}><Icon name="x" size={10}/></button>
            </span>
          ))}
          <button className="filter-chip"><Icon name="plus" size={11}/> Add image</button>
        </div>
      </>}

      <div className="divider"/>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button className="btn">Cancel</button>
        <button className="btn btn-primary">Save changes</button>
      </div>
    </div>
  );
}

// ---- Contract / Endpoints ----
function ContractTab({ integ }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 13, color: "var(--ml-text-2)" }}>
        These are the endpoints {integ.name} calls. Read-only — change them only by deploying a new MatrixLab Runner version.
      </div>

      <EndpointCard
        method="POST" path="/repo/run" required tag="Required"
        purpose="Every shell command, test run, and AI-generated change."
        req={{
          cmd: "pytest -q tests/",
          cwd: "/workspace",
          env: { PYTHONPATH: "src", FOO: "bar" },
          timeout: 120,
          image: "python:3.11-slim",
          allow_network: false,
          mount_workspace: "/host/path/to/workspace",
          stdin: "optional stdin text"
        }}
        res={{
          exit_code: 0,
          stdout: "...test output...",
          stderr: "",
          duration_ms: 4321,
          truncated: false,
          timed_out: false,
          artifacts: ["coverage.xml", "report.html"],
          sandbox_id: "ml-2026-05-15-abc123"
        }}
      />

      <EndpointCard
        method="GET" path="/health" required tag="Required"
        purpose="Doctor probe — green/red status in GitPilot's UI."
        res={{
          ok: true,
          version: "0.4.2",
          uptime_s: 34521,
          image_cache: ["python:3.11-slim", "node:20"]
        }}
      />

      <EndpointCard
        method="GET" path="/version" tag="Optional"
        purpose="One-time on startup; surfaced in doctor card."
        res={{ version: "0.4.2", protocol: "matrixlab.runner.v1" }}
      />

      <EndpointCard
        method="POST" path="/repo/cancel" tag="Optional v2"
        purpose="User clicks Cancel mid-run in GitPilot."
        req={{ sandbox_id: "ml-2026-05-15-abc123" }}
        res={{ ok: true, canceled: true }}
      />

      <div className="card card-pad" style={{ background: "var(--ml-info-soft)", borderColor: "transparent" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Icon name="info" size={16} className=""/>
          <div style={{ fontSize: 13, color: "var(--ml-info)" }}>
            <strong>Status code semantics:</strong> 200 = run finished (regardless of exit code) · 401/403 = auth failed · 408/504 = transport timeout (treat as timed_out) · 429 = concurrency limit (GitPilot retries once) · 5xx = runner internal error (doctor flips amber).
          </div>
        </div>
      </div>
    </div>
  );
}

function EndpointCard({ method, path, purpose, req, res, tag, required }) {
  const methodTone = method === "GET" ? "success" : method === "POST" ? "info" : "warn";
  return (
    <div className="card">
      <div className="card-head">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className={`pill ${methodTone}`} style={{
            fontFamily: "var(--ml-mono)", fontWeight: 600, fontSize: 11
          }}>{method}</span>
          <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{path}</span>
          {required && <Pill tone="danger">Required</Pill>}
          {!required && tag && <Pill tone="neutral">{tag}</Pill>}
        </div>
        <span style={{ fontSize: 12.5, color: "var(--ml-text-3)" }}>{purpose}</span>
      </div>
      <div className="card-pad" style={{ display: "grid", gridTemplateColumns: req ? "1fr 1fr" : "1fr", gap: 14 }}>
        {req && (
          <div>
            <div style={{ fontSize: 11.5, color: "var(--ml-text-3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Request body</div>
            <JsonBlock data={req}/>
          </div>
        )}
        <div>
          <div style={{ fontSize: 11.5, color: "var(--ml-text-3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Response body</div>
          <JsonBlock data={res}/>
        </div>
      </div>
    </div>
  );
}

function JsonBlock({ data }) {
  const json = JSON.stringify(data, null, 2);
  return (
    <pre style={{
      background: "#0c1116",
      color: "#c8d2dc",
      borderRadius: 6,
      padding: "10px 12px",
      fontFamily: "var(--ml-mono)",
      fontSize: 11.5,
      lineHeight: 1.55,
      margin: 0,
      overflow: "auto",
      maxHeight: 280,
    }}>{json}</pre>
  );
}

// ---- Activity ----
function ActivityTab({ integ }) {
  const items = integ.id === "gitpilot" ? gpActivity : gpActivity.slice(0, 3).map(a => ({ ...a, repo: integ.id }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="grid-cards">
        <div className="card stat">
          <div className="stat-label">Calls in 24h</div>
          <div className="stat-value">287</div>
          <div className="stat-meta">+12% vs yesterday</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Error rate</div>
          <div className="stat-value" style={{ color: "var(--ml-success)" }}>1.4%</div>
          <div className="stat-meta">4 failures, 0 5xx</div>
        </div>
        <div className="card stat">
          <div className="stat-label">P50 / P95</div>
          <div className="stat-value">3.2s <span style={{ fontSize: 14, color: "var(--ml-text-3)" }}>/ 18.4s</span></div>
          <div className="stat-meta">includes 1 timeout (120s)</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Auth subject</div>
          <div className="stat-value" style={{ fontFamily: "var(--ml-mono)", fontSize: 18 }}>gitpilot-prod</div>
          <div className="stat-meta">1 token in rotation</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Recent calls</h3>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-sm"><Icon name="download" size={12}/> Export</button>
            <button className="btn btn-sm">Open in Runs</button>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Time</th><th>Sandbox</th><th>Command</th><th>Repo · branch</th><th>Result</th><th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a, i) => (
              <tr key={i}>
                <td><span className="mono" style={{ fontSize: 12 }}>{a.ts}</span></td>
                <td><span className="mono" style={{ fontSize: 12 }}>{a.sandbox}</span></td>
                <td><span className="mono" style={{ fontSize: 12 }}>{a.cmd}</span></td>
                <td>
                  <div style={{ fontSize: 12.5 }}>{a.repo}</div>
                  <div className="mono" style={{ fontSize: 11.5, color: "var(--ml-text-3)" }}>{a.branch}</div>
                </td>
                <td>
                  <Pill tone={a.status === "ok" ? "success" : a.status === "timeout" ? "warn" : "danger"}>
                    {a.status === "ok" ? `exit ${a.exit}` : a.status === "timeout" ? "timeout" : `exit ${a.exit}`}
                  </Pill>
                </td>
                <td>{(a.ms / 1000).toFixed(2)}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Policy ----
function PolicyTab({ integ }) {
  return (
    <div className="grid-2">
      <div className="card card-pad">
        <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>Allowed actions</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <PolicyRow on label="Execute shell commands" sub="POST /repo/run"/>
          <PolicyRow on label="Mount workspace bind"  sub="Persistent across runs on same host path"/>
          <PolicyRow on label="Request network egress" sub="Subject to allowlist"/>
          <PolicyRow      label="Build container images" sub="GitPilot does not need this"/>
          <PolicyRow      label="Access host filesystem outside workspace" sub="Blocked by sandbox"/>
        </div>
      </div>
      <div className="card card-pad">
        <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>Egress allowlist</h3>
        <p style={{ fontSize: 12.5, color: "var(--ml-text-3)", margin: "0 0 10px" }}>
          Hosts permitted when {integ.name} sends <span className="mono">allow_network=true</span>.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {["github.com", "*.githubusercontent.com", "pypi.org", "registry.npmjs.org", "*.docker.io"].map(h => (
            <div key={h} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "1px solid var(--ml-border)", borderRadius: 6 }}>
              <span className="mono" style={{ fontSize: 12, flex: 1 }}>{h}</span>
              <button className="btn btn-ghost btn-sm"><Icon name="x" size={11}/></button>
            </div>
          ))}
          <button className="btn btn-sm" style={{ alignSelf: "flex-start", marginTop: 4 }}><Icon name="plus" size={12}/> Add host</button>
        </div>
      </div>
    </div>
  );
}

function PolicyRow({ on, label, sub }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", background: on ? "var(--ml-success-soft)" : "var(--ml-surface-2)", borderRadius: 6 }}>
      <span style={{
        color: on ? "var(--ml-success)" : "var(--ml-text-3)",
        display: "grid", placeItems: "center"
      }}>
        <Icon name={on ? "check" : "x"} size={14}/>
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: on ? "var(--ml-success)" : "var(--ml-text-3)" }}>{label}</div>
        <div style={{ fontSize: 11.5, color: on ? "var(--ml-success)" : "var(--ml-text-3)", opacity: 0.85 }}>{sub}</div>
      </div>
      <div className={`toggle ${on ? "on" : ""}`}/>
    </div>
  );
}

export { Integrations };
