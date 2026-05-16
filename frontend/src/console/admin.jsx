import React from "react";
import { Icon, Pill, StatCard, seedPool, seedEnvironments, seedArtifacts } from "./shared.jsx";

// ----- Admin: Runtime Health -----
function AdminRuntime() {
  return (
    <div className="content wide">
      <div className="page-head">
        <div>
          <h1 className="page-title">Runtime Health</h1>
          <p className="page-sub">Operator view of the MatrixLab runner and sandbox fleet.</p>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="refresh"/> Run health check</button>
          <button className="btn"><Icon name="terminal"/> Open runner logs</button>
        </div>
      </div>

      <div className="grid-cards" style={{ marginBottom: 18 }}>
        <StatCard label="Ready sandboxes"    value="11" meta="across 6 images" tone="success"/>
        <StatCard label="Starting sandboxes" value="2"  meta="provisioning"/>
        <StatCard label="Failed sandboxes"   value="1"  meta="matrixlab-build" tone="danger"/>
        <StatCard label="Runs in 24h"        value="487" meta="98.4% success rate"/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Runner capabilities</h3>
              <div className="card-sub">Negotiated via GET /capabilities</div>
            </div>
            <Pill tone="success">matrixlab.runner.v1</Pill>
          </div>
          <div className="card-pad">
            <div className="kv">
              <div className="k">API URL</div><div className="v mono">http://localhost:8000</div>
              <div className="k">Runner version</div><div className="v">0.4.2</div>
              <div className="k">Streaming</div><div className="v"><Pill tone="success">Supported</Pill></div>
              <div className="k">Artifacts</div><div className="v"><Pill tone="success">Supported · max 100 MB / run</Pill></div>
              <div className="k">Repo run</div><div className="v"><Pill tone="success">Supported</Pill></div>
              <div className="k">Workspace upload</div><div className="v"><Pill tone="success">Supported · max 50 MB</Pill></div>
              <div className="k">Environment lifecycle</div><div className="v"><Pill tone="success">Supported</Pill></div>
              <div className="k">Warm pool</div><div className="v"><Pill tone="success">Enabled · 4 images</Pill></div>
              <div className="k">Polling interval</div><div className="v">5s</div>
              <div className="k">Bearer auth</div><div className="v"><Pill tone="info">Required</Pill></div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Recent events</h3>
            <button className="btn btn-sm">View all</button>
          </div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Event ts="10:52" tone="info" text="Sandbox sbx-q3v0bm1 provisioned · matrixlab-python · warm pool hit"/>
            <Event ts="10:49" tone="warn" text="Warm pool refill below min for matrixlab-rust (1/3)"/>
            <Event ts="10:42" tone="danger" text="matrixlab-build healthcheck failed · pull error registry.example.com:5000"/>
            <Event ts="10:36" tone="success" text="Image matrixlab-node updated to sha256:b21…7e9"/>
            <Event ts="10:18" tone="info" text="487 runs executed in last 24h · 8 timed out · 0 OOM kills"/>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3 className="card-title">Sandbox image health</h3>
            <div className="card-sub">GET /sandboxes/health · last polled 4s ago</div>
          </div>
          <button className="btn btn-sm"><Icon name="refresh" size={12}/> Refresh</button>
        </div>
        <table className="tbl">
          <thead>
            <tr><th>Image</th><th>Status</th><th>Pool</th><th>Last build</th><th>Digest</th><th>Avg run time</th><th></th></tr>
          </thead>
          <tbody>
            {seedPool.map(p => (
              <tr key={p.image}>
                <td><span className="mono" style={{ fontWeight: 500 }}>{p.image}</span></td>
                <td>
                  {p.failed > 0 ? <Pill tone="danger">Unhealthy</Pill> :
                   p.starting > 0 ? <Pill tone="warn">Refilling</Pill> :
                   <Pill tone="success">Healthy</Pill>}
                </td>
                <td><PoolMeter pool={p}/></td>
                <td>{["2h ago", "5h ago", "yesterday", "yesterday", "3 days ago", "8h ago"][seedPool.indexOf(p)]}</td>
                <td><span className="mono" style={{ fontSize: 12, color: "var(--ml-text-3)" }}>sha256:{(p.image.charCodeAt(0).toString(16) + "d4e2c19a8f72").slice(0, 12)}…</span></td>
                <td>{p.image.includes("rust") ? "11.4s" : p.image.includes("build") ? "—" : p.image.includes("go") ? "3.1s" : "2.2s"}</td>
                <td><button className="btn btn-ghost btn-sm"><Icon name="more" size={14}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PoolMeter({ pool }) {
  const cells = [];
  for (let i = 0; i < pool.ready; i++)    cells.push("ready");
  for (let i = 0; i < pool.starting; i++) cells.push("starting");
  for (let i = 0; i < pool.failed; i++)   cells.push("failed");
  while (cells.length < pool.capacity)    cells.push("empty");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 130 }}>
      <div className="pool-meter">
        {cells.map((c, i) => <div key={i} className={`cell ${c}`}/>)}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--ml-text-3)" }}>
        {pool.ready} ready · {pool.starting} starting{pool.failed > 0 && ` · ${pool.failed} failed`}
      </div>
    </div>
  );
}

function Event({ ts, tone, text }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%", marginTop: 7,
        background: `var(--ml-${tone === "danger" ? "danger" : tone === "warn" ? "warning" : tone === "success" ? "success" : "info"})`,
        flexShrink: 0,
      }}/>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: "var(--ml-text)" }}>{text}</div>
        <div style={{ fontSize: 11.5, color: "var(--ml-text-3)" }}>{ts}</div>
      </div>
    </div>
  );
}

// ----- Admin: Warm Pools (dedicated) -----
function AdminPools() {
  return (
    <div className="content wide">
      <div className="page-head">
        <div>
          <h1 className="page-title">Warm Pools</h1>
          <p className="page-sub">Pre‑warmed, paused sandbox containers for low‑latency local runs.</p>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="refresh"/> Refill all</button>
          <button className="btn btn-primary"><Icon name="cog"/> Pool settings</button>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        {seedPool.map(p => (
          <div key={p.image} className="card card-pad">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="mono" style={{ fontWeight: 600 }}>{p.image}</span>
              {p.failed > 0 ? <Pill tone="danger">Unhealthy</Pill> :
               p.starting > 0 ? <Pill tone="warn">Refilling</Pill> :
               <Pill tone="success">Healthy</Pill>}
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 14, fontSize: 12 }}>
              <div><div style={{ color: "var(--ml-text-3)" }}>Ready</div><div style={{ fontWeight: 600, fontSize: 18 }}>{p.ready}</div></div>
              <div><div style={{ color: "var(--ml-text-3)" }}>Starting</div><div style={{ fontWeight: 600, fontSize: 18 }}>{p.starting}</div></div>
              <div><div style={{ color: "var(--ml-text-3)" }}>Failed</div><div style={{ fontWeight: 600, fontSize: 18 }}>{p.failed}</div></div>
              <div style={{ marginLeft: "auto" }}><div style={{ color: "var(--ml-text-3)" }}>Capacity</div><div style={{ fontWeight: 600, fontSize: 18 }}>{p.capacity}</div></div>
            </div>
            <div style={{ marginTop: 12 }}><PoolMeter pool={p}/></div>
            <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
              <button className="btn btn-sm" style={{ flex: 1 }}><Icon name="play" size={12}/> Refill</button>
              <button className="btn btn-sm" style={{ flex: 1 }}>Drain</button>
              <button className="btn btn-sm btn-ghost"><Icon name="more"/></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----- Environments -----
function Environments({ navigate }) {
  return (
    <div className="content wide">
      <div className="page-head">
        <div>
          <h1 className="page-title">Reusable Environments</h1>
          <p className="page-sub">Cached setups for fast, repeated branch testing.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary"><Icon name="plus"/> Create Environment</button>
        </div>
      </div>

      <div className="card">
        <table className="tbl">
          <thead>
            <tr><th>Name</th><th>Repository</th><th>Default branch</th><th>Runtime</th><th>Cache</th><th>Last built</th><th></th></tr>
          </thead>
          <tbody>
            {seedEnvironments.map(e => (
              <tr key={e.name} onClick={() => navigate("new-run")}>
                <td><span style={{ fontWeight: 500 }}>{e.name}</span></td>
                <td><span className="mono" style={{ fontSize: 12 }}>{e.repo}</span></td>
                <td><span className="mono" style={{ fontSize: 12 }}>{e.branch}</span></td>
                <td>{e.runtime}</td>
                <td><Pill tone={e.status === "Ready" ? "success" : e.status === "Rebuilding" ? "warn" : e.status === "Stale" ? "neutral" : "info"}>{e.status}</Pill></td>
                <td><span style={{ color: "var(--ml-text-3)", fontSize: 12.5 }}>{e.lastBuilt}</span></td>
                <td>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button className="btn btn-sm" onClick={ev => { ev.stopPropagation(); }}><Icon name="play" size={12}/> Run</button>
                    <button className="btn btn-sm" onClick={ev => { ev.stopPropagation(); }}>Rebuild</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----- Profiles -----
// (moved to profiles.jsx — wizard + edit support)

// ----- Artifacts (browser) -----
function Artifacts({ runs, navigate }) {
  const all = runs.flatMap(r => (seedArtifacts[r.id] || []).map(a => ({ ...a, run: r })));
  return (
    <div className="content wide">
      <div className="page-head">
        <div>
          <h1 className="page-title">Artifacts</h1>
          <p className="page-sub">Files captured from completed runs across your team. Retained 30 days.</p>
        </div>
      </div>
      <div className="card">
        <table className="tbl">
          <thead>
            <tr><th>File</th><th>Size</th><th>From run</th><th>Source</th><th>Captured</th><th></th></tr>
          </thead>
          <tbody>
            {all.map((a, i) => (
              <tr key={i} onClick={() => navigate(`run/${a.run.id}`)}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="f-ico">{a.kind}</div>
                    <span style={{ fontWeight: 500 }}>{a.name}</span>
                  </div>
                </td>
                <td>{a.size}</td>
                <td><span className="mono" style={{ fontSize: 12 }}>{a.run.id}</span></td>
                <td>{a.run.source === "repo" ? a.run.repo?.replace("github.com/", "") : a.run.source}</td>
                <td><span className="mono" style={{ fontSize: 12 }}>{a.run.startedAt}</span></td>
                <td>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button className="btn btn-sm" onClick={e => e.stopPropagation()}><Icon name="download" size={12}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----- Security policies (minimal) -----
function Security() {
  const policies = [
    { name: "enterprise-default", scope: "All runs", state: "Active",
      rules: ["Network off by default", "Max timeout 600s", "PID limit 256", "Drop dangerous caps"] },
    { name: "no-secrets-in-logs", scope: "All runs", state: "Active",
      rules: ["Redact AWS_*", "Redact GH_TOKEN, GITHUB_TOKEN", "Redact OPENAI_*", "Redact bearer tokens"] },
    { name: "gitpilot-test-network", scope: "Profile · GitPilot Enterprise", state: "Active",
      rules: ["Network on during setup", "Network off during test", "Allowlist: pypi.org, npmjs.org"] },
    { name: "production-evidence", scope: "Tagged production runs", state: "Active",
      rules: ["Artifacts retained 1 year", "Signed with cosign", "Audit log immutable"] },
  ];
  return (
    <div className="content wide">
      <div className="page-head">
        <div>
          <h1 className="page-title">Security policies</h1>
          <p className="page-sub">Sandbox guardrails applied to every run. Enforced at the runner, not the client.</p>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="download"/> Export</button>
          <button className="btn btn-primary"><Icon name="plus"/> New policy</button>
        </div>
      </div>
      <div className="grid-2">
        {policies.map(p => (
          <div key={p.name} className="card">
            <div className="card-head">
              <div>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div className="card-sub">Scope: {p.scope}</div>
              </div>
              <Pill tone="success">{p.state}</Pill>
            </div>
            <div className="card-pad">
              {p.rules.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 8, padding: "6px 0", fontSize: 13, alignItems: "center" }}>
                  <span style={{ color: "var(--ml-success)" }}><Icon name="check" size={14}/></span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----- Settings (admin) -----
function AdminSettings() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Console settings</h1>
          <p className="page-sub">Connection to MatrixLab runner and console preferences.</p>
        </div>
      </div>
      <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="field">
          <label>Runner URL</label>
          <input className="input" defaultValue="http://localhost:8000"/>
          <span className="hint">Used by VITE_MATRIXLAB_API_URL at build time; override here for this session.</span>
        </div>
        <div className="field">
          <label>Bearer token</label>
          <input className="input" type="password" defaultValue="••••••••••••••••" />
          <span className="hint">Sent as Authorization: Bearer · stored locally.</span>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Polling interval</label>
            <div className="segmented">
              {[2, 5, 10, 30].map(t => (
                <button key={t} className={t === 5 ? "on" : ""}>{t}s</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Default image</label>
            <select className="select" defaultValue="matrixlab-python">
              <option>matrixlab-python</option>
              <option>matrixlab-node</option>
              <option>matrixlab-go</option>
              <option>matrixlab-rust</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>Default network</label>
          <div className="segmented">
            <button className="on">Off — safest</button>
            <button>On — allow installs</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----- Admin images placeholder -----
function AdminImages() {
  return <AdminRuntime/>;
}

export { AdminRuntime, AdminPools, AdminImages, AdminSettings,
         Environments, Artifacts, Security };
