import React from "react";
import { Icon, Pill, StatCard, statusToTone } from "./shared.jsx";

// ----- Dashboard -----
function Dashboard({ runs, navigate, onQuickAction }) {
  const today = runs.filter(r => true);
  const failed = today.filter(r => r.status === "failed").length;
  const timedOut = today.filter(r => r.status === "timeout").length;
  const passed = today.filter(r => r.status === "passed").length;
  const running = today.filter(r => r.status === "running").length;
  const avg = (today.filter(r => r.duration).reduce((s, r) => s + r.duration, 0) /
               Math.max(1, today.filter(r => r.duration).length)).toFixed(1);

  // mock 14-bar sparkline of hourly runs
  const spark = [2, 3, 1, 4, 5, 3, 6, 4, 7, 5, 8, 6, 9, today.length];
  const sparkMax = Math.max(...spark);

  const actions = [
    { id: "code",      icon: "code",   title: "Run Code",          sub: "Python, Node, or Bash snippet" },
    { id: "repo",      icon: "git",    title: "Test Repository",   sub: "Clone a Git repo and run tests" },
    { id: "workspace", icon: "upload", title: "Upload Workspace",  sub: "ZIP project and execute commands" },
    { id: "env",       icon: "box",    title: "Create Environment",sub: "Cache dependencies for fast reruns" },
  ];

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Welcome back, Ana</h1>
          <p className="page-sub">Run code, repositories, and AI‑generated changes safely in isolated environments.</p>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="refresh"/> Refresh</button>
          <button className="btn btn-primary" onClick={() => navigate("new-run")}>
            <Icon name="plus"/> New Run
          </button>
        </div>
      </div>

      {/* Action cards */}
      <div className="grid-cards" style={{ marginBottom: 24 }}>
        {actions.map(a => (
          <button key={a.id} className="action-card" onClick={() => onQuickAction(a.id)}>
            <div className="ico-wrap"><Icon name={a.icon} size={18}/></div>
            <div className="ac-title">{a.title}</div>
            <div className="ac-sub">{a.sub}</div>
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid-cards" style={{ marginBottom: 24 }}>
        <StatCard label="Runs today"   value={today.length} meta={`${running} running · ${passed} passed`}/>
        <StatCard label="Failures"     value={failed} meta={`${timedOut} timed out`} tone={failed > 0 ? "danger" : undefined}/>
        <StatCard label="Avg duration" value={`${avg}s`} meta="across completed runs"/>
        <div className="card stat">
          <div className="stat-label">Activity · last 14h</div>
          <div className="spark" style={{ marginTop: 10 }}>
            {spark.map((v, i) => (
              <i key={i} style={{ height: `${(v/sparkMax)*100}%`,
                background: i === spark.length - 1 ? "var(--ml-accent)" : "var(--ml-accent-soft)" }}/>
            ))}
          </div>
          <div className="stat-meta" style={{ marginTop: 8 }}>Peak: {sparkMax} runs/hour</div>
        </div>
      </div>

      {/* Two-column: recent runs + runtime status */}
      <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 16 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Recent runs</h3>
              <div className="card-sub">Your team's last 6 executions</div>
            </div>
            <button className="btn btn-sm" onClick={() => navigate("runs")}>
              View all <Icon name="chevR" size={14}/>
            </button>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Status</th><th>Source</th><th>Command</th><th>Duration</th><th>Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 6).map(r => (
                <tr key={r.id} onClick={() => navigate(`run/${r.id}`)}>
                  <td><Pill tone={statusToTone(r.status)}>{r.status}</Pill></td>
                  <td>
                    <div style={{ fontWeight: 500 }}>
                      {r.source === "repo" ? r.repo?.replace("github.com/", "") :
                       r.source === "code" ? "Code cell" : "Workspace"}
                    </div>
                    <div className="mono" style={{ color: "var(--ml-text-3)" }}>
                      {r.branch || r.id}
                    </div>
                  </td>
                  <td><span className="mono">{r.command}</span></td>
                  <td>{r.duration != null ? `${r.duration}s` : "—"}</td>
                  <td>{r.started}<span style={{ color: "var(--ml-text-3)" }}> · {r.user}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Runtime status</h3>
            <Pill tone="success">All systems normal</Pill>
          </div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <RuntimeRow icon="activity" label="Runner" value="Healthy" tone="success" meta="matrixlab.runner.v1 · 0.4.2"/>
            <RuntimeRow icon="cpu"      label="Sandbox pool" value="Ready" tone="success" meta="11 ready · 2 starting · 1 failed"/>
            <RuntimeRow icon="db"       label="Artifact storage" value="OK" tone="success" meta="142 GB free of 200 GB"/>
            <RuntimeRow icon="cloud"    label="Network egress" value="Restricted" tone="info" meta="allowlist · 14 destinations"/>
            <div className="divider"/>
            <div style={{ fontSize: 12.5, color: "var(--ml-text-3)" }}>
              Quick links
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-sm" onClick={() => navigate("admin-runtime")}>Runtime details</button>
              <button className="btn btn-sm" onClick={() => navigate("admin-pools")}>Warm pools</button>
              <button className="btn btn-sm" onClick={() => navigate("security")}>Policies</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RuntimeRow({ icon, label, value, tone, meta }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: "var(--ml-surface-2)", color: "var(--ml-text-2)",
        display: "grid", placeItems: "center", flexShrink: 0
      }}>
        <Icon name={icon} size={16}/>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 500, fontSize: 13.5 }}>{label}</span>
          <Pill tone={tone}>{value}</Pill>
        </div>
        <div style={{ fontSize: 12, color: "var(--ml-text-3)", marginTop: 2 }}>{meta}</div>
      </div>
    </div>
  );
}

export { Dashboard };
