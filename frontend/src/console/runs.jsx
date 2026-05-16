import React, { useState, useMemo } from "react";
import { Icon, Pill, statusToTone, seedLogs, seedArtifacts } from "./shared.jsx";

// ----- Runs list -----
function RunsList({ runs, navigate }) {
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [sourceF, setSourceF] = useState("all");

  const filtered = useMemo(() => runs.filter(r => {
    if (statusF !== "all" && r.status !== statusF) return false;
    if (sourceF !== "all" && r.source !== sourceF) return false;
    if (q) {
      const s = q.toLowerCase();
      const blob = `${r.id} ${r.command} ${r.repo || ""} ${r.branch || ""} ${r.user}`.toLowerCase();
      if (!blob.includes(s)) return false;
    }
    return true;
  }), [runs, q, statusF, sourceF]);

  return (
    <div className="content wide">
      <div className="page-head">
        <div>
          <h1 className="page-title">Runs</h1>
          <p className="page-sub">Searchable history of every execution. Click any row for full details.</p>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="download"/> Export CSV</button>
          <button className="btn btn-primary" onClick={() => navigate("new-run")}><Icon name="plus"/> New Run</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head" style={{ flexDirection: "column", alignItems: "stretch", gap: 12, padding: 14 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div className="search">
              <Icon name="search" size={14}/>
              <input className="input" placeholder="Search by repo, sandbox id, user, command…"
                value={q} onChange={e => setQ(e.target.value)}/>
            </div>
            <div style={{ marginLeft: "auto", color: "var(--ml-text-3)", fontSize: 12.5 }}>
              {filtered.length} of {runs.length} runs
            </div>
          </div>
          <div className="filter-row" style={{ margin: 0 }}>
            <span style={{ fontSize: 12, color: "var(--ml-text-3)", marginRight: 4 }}>Status</span>
            {["all", "passed", "failed", "timeout", "running"].map(s => (
              <button key={s} className={`filter-chip ${statusF === s ? "on" : ""}`}
                onClick={() => setStatusF(s)}>
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <span style={{ width: 12 }}/>
            <span style={{ fontSize: 12, color: "var(--ml-text-3)", marginRight: 4 }}>Source</span>
            {["all", "code", "repo", "workspace"].map(s => (
              <button key={s} className={`filter-chip ${sourceF === s ? "on" : ""}`}
                onClick={() => setSourceF(s)}>
                {s === "all" ? "All" : s === "code" ? "Code" : s === "repo" ? "Repository" : "Workspace"}
              </button>
            ))}
          </div>
        </div>

        <table className="tbl">
          <thead>
            <tr>
              <th>Status</th>
              <th>Source</th>
              <th>Command</th>
              <th>Profile</th>
              <th>Duration</th>
              <th>Started</th>
              <th>User</th>
              <th>Artifacts</th>
              <th style={{ width: 24 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="empty">No runs match your filters.</td></tr>
            )}
            {filtered.map(r => (
              <tr key={r.id} onClick={() => navigate(`run/${r.id}`)}>
                <td><Pill tone={statusToTone(r.status)}>{r.status}</Pill></td>
                <td>
                  <div style={{ fontWeight: 500 }}>
                    {r.source === "repo" ? r.repo?.replace("github.com/", "") :
                     r.source === "code" ? "Code cell" : "Workspace"}
                  </div>
                  <div className="mono" style={{ fontSize: 11.5, color: "var(--ml-text-3)" }}>
                    {r.branch || r.id}
                  </div>
                </td>
                <td><span className="mono">{r.command}</span></td>
                <td>{r.profile}</td>
                <td>{r.duration != null ? `${r.duration}s` : <span style={{ color: "var(--ml-info)" }}>in progress</span>}</td>
                <td><span className="mono" style={{ fontSize: 12 }}>{r.startedAt}</span></td>
                <td>{r.user}</td>
                <td>{r.artifacts > 0 ? `${r.artifacts} file${r.artifacts>1?"s":""}` : "—"}</td>
                <td><Icon name="chevR" size={14}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----- Run detail -----
function RunDetail({ run, navigate }) {
  const [tab, setTab] = useState("summary");
  if (!run) {
    return <div className="content"><div className="empty">Run not found.</div></div>;
  }
  const logs = seedLogs(run);
  const artifacts = seedArtifacts[run.id] || [];

  return (
    <div className="content wide">
      <div className="page-head" style={{ alignItems: "flex-start" }}>
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate("runs")}>
            <Icon name="chevL" size={14}/> All runs
          </button>
          <h1 className="page-title" style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 12 }}>
            <span className="mono" style={{ fontSize: 18, fontWeight: 600 }}>Run · {run.id}</span>
            <Pill tone={statusToTone(run.status)}>{run.status}</Pill>
          </h1>
          <p className="page-sub">
            {run.source === "repo" ? `${run.repo} · ${run.branch}` :
             run.source === "code" ? "Code cell execution" : "Workspace execution"}
            {" · started "}{run.startedAt}{" by "}{run.user}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="refresh" size={14}/> Rerun</button>
          <button className="btn btn-danger" disabled={run.status !== "running"}>Cancel</button>
        </div>
      </div>

      {/* meta strip */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", padding: 0 }}>
          <Meta label="Status" value={<Pill tone={statusToTone(run.status)}>{run.status}</Pill>}/>
          <Meta label="Duration" value={run.duration != null ? `${run.duration}s` : "—"}/>
          <Meta label="Exit code" value={run.exit != null ? String(run.exit) : "—"}/>
          <Meta label="Image" value={<span className="mono" style={{ fontSize: 12 }}>{run.image}</span>}/>
          <Meta label="Network" value={<Pill tone={run.network === "off" ? "neutral" : "info"}>{run.network}</Pill>}/>
          <Meta label="Profile" value={run.profile}/>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === "summary" ? "active" : ""}`} onClick={() => setTab("summary")}>Summary</button>
        <button className={`tab ${tab === "logs" ? "active" : ""}`} onClick={() => setTab("logs")}>Logs</button>
        <button className={`tab ${tab === "artifacts" ? "active" : ""}`} onClick={() => setTab("artifacts")}>
          Artifacts <span className="count">{artifacts.length}</span>
        </button>
        <button className={`tab ${tab === "environment" ? "active" : ""}`} onClick={() => setTab("environment")}>Environment</button>
        <button className={`tab ${tab === "security" ? "active" : ""}`} onClick={() => setTab("security")}>Security</button>
      </div>

      {tab === "summary"     && <SummaryTab run={run}/>}
      {tab === "logs"        && <LogsTab run={run} logs={logs}/>}
      {tab === "artifacts"   && <ArtifactsTab artifacts={artifacts} run={run}/>}
      {tab === "environment" && <EnvTab run={run}/>}
      {tab === "security"    && <SecurityTab run={run}/>}
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div style={{ padding: "14px 18px", borderRight: "1px solid var(--ml-border)" }}>
      <div style={{ fontSize: 11.5, color: "var(--ml-text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 14, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function SummaryTab({ run }) {
  const ok = run.status === "passed";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
      <div className="card card-pad">
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>
          {run.status === "passed" ? "Run completed successfully" :
           run.status === "failed" ? "Run failed" :
           run.status === "timeout" ? "Run timed out" : "Run in progress"}
        </h3>
        <p style={{ margin: 0, color: "var(--ml-text-3)" }}>
          {run.status === "passed" ? `Command exited with status 0 after ${run.duration}s.` :
           run.status === "failed" ? `Command exited with status ${run.exit} after ${run.duration}s.` :
           run.status === "timeout" ? `Sandbox killed after ${run.duration}s timeout.` :
           "Logs streaming in real time."}
        </p>
        <div className="divider"/>
        <div className="field">
          <label>Command</label>
          <div className="terminal" style={{ padding: "10px 14px" }}>
            <span className="prompt">$ </span><span className="t-cmd">{run.command}</span>
          </div>
        </div>
        <div className="divider"/>
        <div className="field">
          <label>{ok ? "Output summary" : "Error summary"}</label>
          <div style={{ fontSize: 13.5, padding: "10px 14px",
            background: ok ? "var(--ml-success-soft)" : "var(--ml-danger-soft)",
            color: ok ? "var(--ml-success)" : "var(--ml-danger)",
            borderRadius: "var(--ml-radius-sm)",
            fontFamily: "var(--ml-mono)" }}>
            {run.output || "—"}
          </div>
        </div>
        {run.status === "failed" && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--ml-surface-2)", borderRadius: 6, fontSize: 13 }}>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>Likely reason</div>
            <div style={{ color: "var(--ml-text-2)" }}>Test assertion failure in tests/test_api.py — the API contract changed and 3 cases are out of date.</div>
          </div>
        )}
      </div>
      <div className="card">
        <div className="card-head"><h3 className="card-title">Timeline</h3></div>
        <div className="card-pad">
          <Timeline run={run}/>
        </div>
      </div>
    </div>
  );
}

function Timeline({ run }) {
  const steps = [
    { t: "Queued",        sub: "0.1s", state: "done" },
    { t: "Provisioned sandbox", sub: "0.4s", state: "done" },
    { t: "Pulled workspace", sub: run.source === "repo" ? "2.1s (clone)" : "0.2s", state: "done" },
    { t: "Executed command", sub: run.duration != null ? `${run.duration}s` : "running…",
      state: run.status === "running" ? "current" : "done" },
    { t: "Collected artifacts", sub: run.artifacts > 0 ? `${run.artifacts} files` : "none",
      state: run.status === "running" ? "todo" : "done" },
    { t: "Sandbox destroyed", sub: "0.1s", state: run.status === "running" ? "todo" : "done" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{
            width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 2,
            display: "grid", placeItems: "center",
            background: s.state === "done" ? "var(--ml-success)" : s.state === "current" ? "white" : "var(--ml-surface-2)",
            border: s.state === "current" ? "2px solid var(--ml-info)" : "1px solid var(--ml-border)",
            color: "white"
          }}>
            {s.state === "done" && <Icon name="check" size={11}/>}
            {s.state === "current" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ml-info)" }}/>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: s.state === "current" ? 600 : 500 }}>{s.t}</div>
            <div style={{ fontSize: 12, color: "var(--ml-text-3)" }}>{s.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LogsTab({ run, logs }) {
  const [view, setView] = useState("stdout");
  return (
    <div className="terminal-wrap">
      <div className="term-toolbar">
        {["stdout", "stderr", "events", "raw json"].map(v => (
          <button key={v} className={`term-tab ${view === v ? "on" : ""}`} onClick={() => setView(v)}>{v}</button>
        ))}
        <div className="term-tools">
          <button><Icon name="search" size={12}/> Search</button>
          <button><Icon name="copy" size={12}/> Copy</button>
          <button><Icon name="download" size={12}/> Download</button>
        </div>
      </div>
      <div className="terminal" style={{ minHeight: 360 }}>
        {logs.map((l, i) => (
          <span key={i} className={`ln t-${l.t}`}>
            {l.t === "cmd" && <span className="prompt">$ </span>}
            {l.text}
          </span>
        ))}
        {run.status === "running" && (
          <span className="ln"><span style={{ background: "#c8d2dc", display: "inline-block",
            width: 8, height: 14, verticalAlign: "middle", animation: "blink 1s infinite" }}/></span>
        )}
      </div>
      <style>{`@keyframes blink { 50% { opacity: 0.2; } }`}</style>
    </div>
  );
}

function ArtifactsTab({ artifacts, run }) {
  if (artifacts.length === 0) {
    return <div className="card"><div className="empty">No artifacts were produced by this run.</div></div>;
  }
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3 className="card-title">Artifacts</h3>
          <div className="card-sub">Files captured from the sandbox. Retained for 30 days.</div>
        </div>
        <button className="btn btn-sm"><Icon name="download" size={12}/> Download all</button>
      </div>
      {artifacts.map((a, i) => (
        <div key={i} className="file-row">
          <div className="f-ico">{a.kind}</div>
          <div style={{ flex: 1 }}>
            <div className="f-name">{a.name}</div>
            <div className="f-meta">{a.size}</div>
          </div>
          <div className="f-actions">
            <button className="btn btn-sm"><Icon name="eye" size={12}/> Preview</button>
            <button className="btn btn-sm"><Icon name="download" size={12}/> Download</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function EnvTab({ run }) {
  return (
    <div className="card card-pad">
      <div className="kv">
        <div className="k">Sandbox image</div><div className="v mono">{run.image}@sha256:9d4ef…3c4</div>
        <div className="k">Image build date</div><div className="v">2026-04-29</div>
        <div className="k">Runner host</div><div className="v mono">matrixlab-runner-01.us-east-1</div>
        <div className="k">Protocol</div><div className="v mono">matrixlab.runner.v1 · 0.4.2</div>
        <div className="k">Warm pool</div><div className="v">{run.source === "code" ? "Hit — 0.42s startup" : "Miss — provisioned fresh"}</div>
        <div className="k">Environment variables</div>
        <div className="v mono" style={{ fontSize: 12.5 }}>
          MATRIXLAB_TIMEOUT=120{"\n"}
          MATRIXLAB_NETWORK={run.network}{"\n"}
          LANG=C.UTF-8
        </div>
        <div className="k">Working directory</div><div className="v mono">/workspace</div>
        <div className="k">User</div><div className="v mono">sandbox (uid=1000)</div>
      </div>
    </div>
  );
}

function SecurityTab({ run }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div className="card card-pad">
        <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>Sandbox isolation</h3>
        <div className="kv">
          <div className="k">Network</div><div className="v">{run.network === "off" ? "Disabled" : "Allowlist · 14 destinations"}</div>
          <div className="k">CPU limit</div><div className="v">1 core (hard cap)</div>
          <div className="k">Memory limit</div><div className="v">1024 MB (oom_kill_disable=false)</div>
          <div className="k">PID limit</div><div className="v">256</div>
          <div className="k">Timeout</div><div className="v">120s</div>
          <div className="k">Workspace mount</div><div className="v">read‑only</div>
          <div className="k">Capabilities dropped</div><div className="v mono" style={{ fontSize: 12 }}>SYS_ADMIN, NET_RAW, MKNOD, AUDIT_WRITE</div>
          <div className="k">Seccomp profile</div><div className="v mono">matrixlab-default-v3</div>
        </div>
      </div>
      <div className="card card-pad">
        <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>Evidence & retention</h3>
        <div className="kv">
          <div className="k">Audit log entry</div><div className="v mono" style={{ fontSize: 12 }}>audit/2026-05-15/{run.id}.jsonl</div>
          <div className="k">Run digest</div><div className="v mono" style={{ fontSize: 12 }}>sha256:f4b…91a</div>
          <div className="k">Signed by</div><div className="v">matrixlab-runner-01 · cosign</div>
          <div className="k">Artifacts retained until</div><div className="v">2026-06-14</div>
          <div className="k">Logs retained until</div><div className="v">2026-08-13</div>
          <div className="k">Policies applied</div><div className="v">enterprise-default · no-secrets-in-logs</div>
        </div>
        <div style={{ marginTop: 14, padding: "10px 12px", background: "var(--ml-info-soft)", borderRadius: 6, fontSize: 12.5, color: "var(--ml-info)" }}>
          <Icon name="info" size={13}/>&nbsp; This record is immutable. Use it for compliance and rollback evidence.
        </div>
      </div>
    </div>
  );
}

export { RunsList, RunDetail };
