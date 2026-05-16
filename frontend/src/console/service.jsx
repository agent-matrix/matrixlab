import React, { useState, useEffect, useRef } from "react";
import { Icon, Pill, StatCard } from "./shared.jsx";

// ---- Connected clients (apps using MatrixLab) ----
const CLIENTS = [
  { id: "gitpilot",         name: "GitPilot",        instance: "gitpilot-prod-1",  version: "1.7.4",  host: "gitpilot.internal:9000", health: "healthy",  rpm: 38, errorRate: 1.4, p95: 4120, lastSeen: 4,    runs24h: 287, glyph: "GP", glyphBg: "linear-gradient(135deg, #0f7a73, #2563eb)" },
  { id: "gitpilot-stg",     name: "GitPilot",        instance: "gitpilot-staging", version: "1.8.0-rc1", host: "gitpilot-stg.internal:9000", health: "healthy", rpm: 6,  errorRate: 0,   p95: 3050, lastSeen: 11, runs24h: 24,  glyph: "GP", glyphBg: "linear-gradient(135deg, #0f7a73, #2563eb)" },
  { id: "agent-generator",  name: "Agent Generator", instance: "agent-gen-prod",   version: "0.9.1",  host: "agentgen.internal:8080", health: "healthy",  rpm: 4,  errorRate: 0,   p95: 9400, lastSeen: 23,   runs24h: 41,  glyph: "AG", glyphBg: "linear-gradient(135deg, #7c3aed, #db2777)" },
  { id: "repoguardian",     name: "RepoGuardian",    instance: "guardian-eu",      version: "0.4.0",  host: "guardian.eu.internal",   health: "warning",  rpm: 2,  errorRate: 11.1,p95: 22000,lastSeen: 71,   runs24h: 18,  glyph: "RG", glyphBg: "linear-gradient(135deg, #157f4a, #0f7a73)" },
  { id: "mcp-forge",        name: "MCP Forge",       instance: "mcp-forge-01",     version: "0.6.2",  host: "mcp.internal:4000",      health: "healthy",  rpm: 11, errorRate: 0.2, p95: 850,  lastSeen: 2,    runs24h: 612, glyph: "MC", glyphBg: "linear-gradient(135deg, #2563eb, #0ea5e9)" },
  { id: "matrix-hub",       name: "Matrix Hub",      instance: "hub-01",           version: "1.2.0",  host: "hub.internal:80",        health: "idle",     rpm: 0,  errorRate: 0,   p95: 0,    lastSeen: 1840, runs24h: 3,   glyph: "MH", glyphBg: "linear-gradient(135deg, #0f172a, #475569)" },
];

const ENDPOINT_STATS = [
  { method: "POST", path: "/repo/run",   rpm: 41, p50: 2100, p95: 8400, errors: 0.8 },
  { method: "POST", path: "/code/run",   rpm: 12, p50: 620,  p95: 1800, errors: 0.1 },
  { method: "POST", path: "/run",        rpm: 6,  p50: 1450, p95: 3900, errors: 0.0 },
  { method: "GET",  path: "/health",     rpm: 240,p50: 4,    p95: 12,   errors: 0.0 },
  { method: "GET",  path: "/capabilities", rpm: 18, p50: 7,  p95: 22,   errors: 0.0 },
  { method: "GET",  path: "/pool/status",  rpm: 12, p50: 6,  p95: 14,   errors: 0.0 },
  { method: "POST", path: "/env/bootstrap", rpm: 1, p50: 8200, p95: 14000, errors: 5.0 },
];

const INCIDENTS = [
  { t: "10:38",   level: "minor",    title: "P95 spike on /repo/run", body: "Latency reached 14.2s for 90s (RepoGuardian client). Auto-resolved." },
  { t: "08:12",   level: "info",     title: "Warm pool refilled",     body: "matrixlab-rust drained to 0, refilled to min (3) in 42s." },
  { t: "Yesterday", level: "major",  title: "Image pull failure",     body: "matrixlab-build couldn't pull from registry.example.com:5000 for 11 min. Mitigated by failover registry." },
];

// ---- Main page ----
function ServiceMonitor() {
  // simulated rolling state
  const [live, setLive] = useState({
    rpm: 314, sandboxes: 13, errorRate: 0.6, p95: 2100, queue: 0,
    cpu: 38, mem: 52, disk: 71,
    feed: seedFeed(),
  });

  // request feed: push a new entry every ~1.4s, drop oldest
  useEffect(() => {
    const tick = () => setLive(s => {
      const entry = randomFeedEntry();
      const feed = [entry, ...s.feed].slice(0, 40);
      const rpm = clamp(s.rpm + (Math.random() * 8 - 4), 280, 360);
      const sandboxes = clamp(s.sandboxes + (Math.random() > 0.6 ? 1 : -1), 8, 18);
      const errorRate = clamp(s.errorRate + (Math.random() * 0.4 - 0.18), 0.1, 1.6);
      const p95 = clamp(s.p95 + (Math.random() * 300 - 140), 1500, 3200);
      const cpu = clamp(s.cpu + (Math.random() * 6 - 3), 22, 64);
      const mem = clamp(s.mem + (Math.random() * 3 - 1.5), 40, 68);
      return { ...s, feed, rpm, sandboxes, errorRate, p95, cpu, mem };
    });
    const id = setInterval(tick, 1400);
    return () => clearInterval(id);
  }, []);

  // history sparklines (last 30 ticks) — locally tracked
  const histRef = useRef({ rpm: [], sandboxes: [], errors: [], p95: [], cpu: [], mem: [] });
  useEffect(() => {
    const k = histRef.current;
    const push = (arr, v) => { arr.push(v); while (arr.length > 30) arr.shift(); };
    push(k.rpm, live.rpm); push(k.sandboxes, live.sandboxes);
    push(k.errors, live.errorRate); push(k.p95, live.p95);
    push(k.cpu, live.cpu); push(k.mem, live.mem);
  }, [live]);
  const h = histRef.current;

  return (
    <div className="content wide">
      <div className="page-head">
        <div>
          <h1 className="page-title">Service Monitor</h1>
          <p className="page-sub">MatrixLab as a microservice — live view of the runner, connected apps, and every request flowing through.</p>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="refresh"/> Refresh</button>
          <button className="btn"><Icon name="download"/> Export metrics</button>
          <button className="btn btn-primary"><Icon name="bell"/> Alert rules</button>
        </div>
      </div>

      {/* Status hero */}
      <StatusHero/>

      {/* KPIs */}
      <div className="grid-cards" style={{ marginTop: 16, marginBottom: 16 }}>
        <KpiCard label="Requests / min" value={Math.round(live.rpm)} hist={h.rpm} tone="accent" suffix="rpm"/>
        <KpiCard label="Active sandboxes" value={live.sandboxes} hist={h.sandboxes} tone="info" suffix=""/>
        <KpiCard label="P95 latency" value={`${(live.p95/1000).toFixed(2)}s`} hist={h.p95} tone={live.p95 > 5000 ? "warn" : "success"}/>
        <KpiCard label="Error rate" value={`${live.errorRate.toFixed(2)}%`} hist={h.errors} tone={live.errorRate > 1 ? "warn" : "success"}/>
      </div>

      {/* Two-column: clients (wide) + endpoints */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, marginBottom: 16 }}>
        <ClientsPanel clients={CLIENTS}/>
        <EndpointsPanel stats={ENDPOINT_STATS}/>
      </div>

      {/* Live feed + resource charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, marginBottom: 16 }}>
        <LiveFeed feed={live.feed}/>
        <ResourcePanel cpu={live.cpu} mem={live.mem} disk={live.disk} cpuHist={h.cpu} memHist={h.mem}/>
      </div>

      <IncidentsPanel/>
    </div>
  );
}

// ---- Status hero ----
function StatusHero() {
  return (
    <div className="card" style={{
      background: "linear-gradient(120deg, var(--ml-surface) 0%, var(--ml-success-soft) 120%)",
      borderColor: "transparent",
      padding: 0, overflow: "hidden",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", padding: "22px 26px", alignItems: "center", gap: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ position: "relative", width: 14, height: 14 }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--ml-success)" }}/>
              <span style={{ position: "absolute", inset: -6, borderRadius: "50%", border: "2px solid var(--ml-success)",
                opacity: 0.4, animation: "sm-pulse 2s ease-out infinite" }}/>
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
              All systems operational
            </h2>
          </div>
          <div style={{ marginTop: 4, color: "var(--ml-text-2)", fontSize: 13.5 }}>
            <span className="mono">matrixlab.runner.v1</span> · v0.4.2 · region us-east-1 · 6 clients connected
          </div>
        </div>
        <div/>
        <div style={{ display: "flex", gap: 18 }}>
          <HeroStat label="Uptime"      value="9d 14h"/>
          <HeroStat label="Total runs"  value="48,217"/>
          <HeroStat label="Today"       value="487" sub="98.6% success"/>
        </div>
      </div>
      <style>{`@keyframes sm-pulse { from { opacity: 0.5; transform: scale(0.6); } to { opacity: 0; transform: scale(1.4); } }`}</style>
    </div>
  );
}

function HeroStat({ label, value, sub }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: "var(--ml-text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--ml-success)" }}>{sub}</div>}
    </div>
  );
}

// ---- KPI cards with sparkline ----
function KpiCard({ label, value, hist, tone, suffix = "" }) {
  const max = Math.max(...hist, 1);
  const min = Math.min(...hist, 0);
  const range = max - min || 1;
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div className="stat-value" style={{ color: tone === "warn" ? "var(--ml-warning)" : tone === "success" ? "var(--ml-success)" : "var(--ml-text)" }}>
          {value}
        </div>
        {suffix && <div style={{ fontSize: 13, color: "var(--ml-text-3)" }}>{suffix}</div>}
      </div>
      <div style={{ marginTop: 10, height: 28, position: "relative" }}>
        <svg width="100%" height="28" viewBox="0 0 100 28" preserveAspectRatio="none" style={{ display: "block" }}>
          {hist.length > 1 && (() => {
            const pts = hist.map((v, i) => {
              const x = (i / (hist.length - 1)) * 100;
              const y = 28 - ((v - min) / range) * 24 - 2;
              return `${x},${y}`;
            });
            const stroke = tone === "warn" ? "var(--ml-warning)" : tone === "success" ? "var(--ml-success)" : "var(--ml-accent)";
            const fill = tone === "warn" ? "var(--ml-warning-soft)" : tone === "success" ? "var(--ml-success-soft)" : "var(--ml-accent-soft)";
            return (
              <>
                <polygon
                  points={`0,28 ${pts.join(" ")} 100,28`}
                  fill={fill}
                />
                <polyline
                  points={pts.join(" ")}
                  fill="none"
                  stroke={stroke}
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}

// ---- Clients panel ----
function ClientsPanel({ clients }) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3 className="card-title">Connected applications</h3>
          <div className="card-sub">Apps actively calling this MatrixLab Runner. Heartbeat via GET /health every 5s.</div>
        </div>
        <Pill tone="info">{clients.filter(c => c.health !== "idle").length} live · {clients.filter(c => c.health === "idle").length} idle</Pill>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Application</th><th>Version</th><th>Health</th>
            <th>RPM</th><th>P95</th><th>Errors</th><th>Last seen</th><th>24h runs</th>
          </tr>
        </thead>
        <tbody>
          {clients.map(c => (
            <tr key={c.id}>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="int-glyph" style={{ background: c.glyphBg, width: 28, height: 28, fontSize: 10.5, borderRadius: 7 }}>{c.glyph}</div>
                  <div>
                    <div style={{ fontWeight: 500 }}>{c.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--ml-text-3)" }}>{c.instance}</div>
                  </div>
                </div>
              </td>
              <td><span className="mono" style={{ fontSize: 12 }}>{c.version}</span></td>
              <td>
                <Pill tone={c.health === "healthy" ? "success" : c.health === "warning" ? "warn" : c.health === "idle" ? "neutral" : "danger"}>
                  {c.health}
                </Pill>
              </td>
              <td>{c.rpm}</td>
              <td>{c.p95 ? `${(c.p95 / 1000).toFixed(1)}s` : "—"}</td>
              <td style={{ color: c.errorRate > 5 ? "var(--ml-danger)" : c.errorRate > 1 ? "var(--ml-warning)" : "var(--ml-text)" }}>
                {c.errorRate.toFixed(1)}%
              </td>
              <td>{formatAgo(c.lastSeen)}</td>
              <td>{c.runs24h}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Endpoints panel ----
function EndpointsPanel({ stats }) {
  const maxRpm = Math.max(...stats.map(s => s.rpm));
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3 className="card-title">Endpoints</h3>
          <div className="card-sub">Per-route call rate · last 1m</div>
        </div>
      </div>
      <div style={{ padding: "8px 0 12px" }}>
        {stats.map((s, i) => (
          <div key={i} style={{ padding: "8px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <span className={`pill ${s.method === "GET" ? "success" : "info"}`} style={{
                fontFamily: "var(--ml-mono)", fontWeight: 600, fontSize: 10.5, padding: "1px 6px"
              }}>{s.method}</span>
              <span className="mono" style={{ fontSize: 12.5, fontWeight: 500 }}>{s.path}</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--ml-text-3)" }}>
                {s.rpm} rpm
              </span>
            </div>
            <div className="bar"><i style={{ width: `${(s.rpm / maxRpm) * 100}%`, background: s.errors > 1 ? "var(--ml-warning)" : "var(--ml-accent)" }}/></div>
            <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--ml-text-3)", marginTop: 4 }}>
              <span>p50 {s.p50 < 100 ? `${s.p50}ms` : `${(s.p50/1000).toFixed(2)}s`}</span>
              <span>p95 {s.p95 < 100 ? `${s.p95}ms` : `${(s.p95/1000).toFixed(2)}s`}</span>
              <span style={{ color: s.errors > 1 ? "var(--ml-warning)" : "var(--ml-text-3)" }}>err {s.errors.toFixed(1)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Live request feed ----
function LiveFeed({ feed }) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3 className="card-title">Live requests</h3>
          <div className="card-sub">Last {feed.length} requests · auto-updating</div>
        </div>
        <Pill tone="success" dot><span style={{ animation: "sm-blink 1.4s infinite" }}>●</span> Streaming</Pill>
      </div>
      <div style={{ maxHeight: 360, overflowY: "auto" }}>
        <table className="tbl" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ width: 70 }}>Time</th>
              <th style={{ width: 60 }}>Method</th>
              <th>Path</th>
              <th>Client</th>
              <th style={{ width: 80 }}>Status</th>
              <th style={{ width: 70 }}>Latency</th>
            </tr>
          </thead>
          <tbody>
            {feed.map((f, i) => (
              <tr key={f.id} style={{
                cursor: "default",
                background: i === 0 ? "var(--ml-accent-soft)" : undefined,
                transition: "background .8s",
              }}>
                <td><span className="mono" style={{ color: "var(--ml-text-3)" }}>{f.time}</span></td>
                <td>
                  <span className={`pill ${f.method === "GET" ? "success" : "info"}`} style={{
                    fontFamily: "var(--ml-mono)", fontSize: 10, padding: "1px 5px", fontWeight: 600
                  }}>{f.method}</span>
                </td>
                <td><span className="mono">{f.path}</span></td>
                <td>{f.client}</td>
                <td>
                  <Pill tone={f.status < 400 ? "success" : f.status >= 500 ? "danger" : "warn"} dot={false}>
                    {f.status}
                  </Pill>
                </td>
                <td style={{ color: f.latency > 5000 ? "var(--ml-warning)" : "var(--ml-text-2)" }}>
                  {f.latency < 100 ? `${f.latency}ms` : `${(f.latency / 1000).toFixed(2)}s`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <style>{`@keyframes sm-blink { 50% { opacity: 0.2; } }`}</style>
    </div>
  );
}

// ---- Resource panel ----
function ResourcePanel({ cpu, mem, disk, cpuHist, memHist }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Runner host</h3>
        <span className="mono" style={{ fontSize: 11.5, color: "var(--ml-text-3)" }}>matrixlab-runner-01</span>
      </div>
      <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Gauge label="CPU"    value={cpu}  hist={cpuHist} cap={100} suffix="%"/>
        <Gauge label="Memory" value={mem}  hist={memHist} cap={100} suffix="%"/>
        <Gauge label="Disk"   value={disk} cap={100} suffix="%" warn={disk > 80}/>
        <div className="divider"/>
        <div className="kv" style={{ gridTemplateColumns: "120px 1fr", gap: "4px 12px", fontSize: 12.5 }}>
          <div className="k">Docker</div><div className="v">24.0.7 · OK</div>
          <div className="k">Containers</div><div className="v">13 active / 87 stopped</div>
          <div className="k">Concurrency cap</div><div className="v">24 runs</div>
          <div className="k">Queue depth</div><div className="v">0</div>
          <div className="k">Region</div><div className="v">us-east-1 · zone a</div>
        </div>
      </div>
    </div>
  );
}

function Gauge({ label, value, hist, cap, suffix, warn }) {
  const pct = (value / cap) * 100;
  const tone = warn || pct > 80 ? "warn" : pct > 60 ? "info" : "success";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, color: "var(--ml-text-2)" }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: `var(--ml-${tone === "warn" ? "warning" : tone === "info" ? "info" : "success"})` }}>
          {Math.round(value)}{suffix}
        </span>
      </div>
      <div className="bar" style={{ height: 8 }}>
        <i style={{
          width: `${pct}%`,
          background: tone === "warn" ? "var(--ml-warning)" : tone === "info" ? "var(--ml-info)" : "var(--ml-success)",
        }}/>
      </div>
    </div>
  );
}

// ---- Incidents ----
function IncidentsPanel() {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3 className="card-title">Recent incidents</h3>
          <div className="card-sub">Last 24 hours · all auto-detected</div>
        </div>
        <button className="btn btn-sm">View status page</button>
      </div>
      <div>
        {INCIDENTS.map((it, i) => (
          <div key={i} style={{
            padding: "14px 18px",
            borderBottom: i < INCIDENTS.length - 1 ? "1px solid var(--ml-border)" : 0,
            display: "flex", gap: 14, alignItems: "flex-start",
          }}>
            <span className={`pill ${it.level === "major" ? "danger" : it.level === "minor" ? "warn" : "info"}`}>
              {it.level}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 13.5 }}>{it.title}</div>
              <div style={{ fontSize: 12.5, color: "var(--ml-text-3)", marginTop: 2 }}>{it.body}</div>
            </div>
            <div style={{ color: "var(--ml-text-3)", fontSize: 12, whiteSpace: "nowrap" }}>{it.t}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- helpers ----
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function formatAgo(seconds) {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

let __feedId = 1000;
function seedFeed() {
  const arr = [];
  for (let i = 0; i < 14; i++) arr.push(randomFeedEntry(i));
  return arr;
}
function randomFeedEntry(offset = 0) {
  const endpoints = [
    { method: "POST", path: "/repo/run",   weight: 8, lat: [800, 9000] },
    { method: "POST", path: "/code/run",   weight: 4, lat: [200, 1800] },
    { method: "GET",  path: "/health",     weight: 12, lat: [2, 18] },
    { method: "GET",  path: "/capabilities", weight: 2, lat: [3, 25] },
    { method: "GET",  path: "/pool/status",  weight: 2, lat: [2, 14] },
    { method: "POST", path: "/run",        weight: 3, lat: [600, 4000] },
    { method: "POST", path: "/env/bootstrap", weight: 1, lat: [6000, 14000] },
  ];
  const total = endpoints.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  let pick = endpoints[0];
  for (const e of endpoints) { r -= e.weight; if (r <= 0) { pick = e; break; } }
  const client = pickWeighted([
    { v: "gitpilot-prod-1",  w: 10 },
    { v: "gitpilot-staging", w: 3 },
    { v: "mcp-forge-01",     w: 6 },
    { v: "agent-gen-prod",   w: 2 },
    { v: "guardian-eu",      w: 1.4 },
  ]);
  const lat = Math.round(pick.lat[0] + Math.random() * (pick.lat[1] - pick.lat[0]));
  const fail = Math.random() < (pick.path === "/env/bootstrap" ? 0.08 : pick.path.startsWith("/repo") ? 0.018 : 0.002);
  const status = fail ? (Math.random() < 0.5 ? 500 : Math.random() < 0.5 ? 408 : 422) : 200;
  const now = new Date(Date.now() - offset * 1500);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return {
    id: ++__feedId,
    time: `${hh}:${mm}:${ss}`,
    method: pick.method,
    path: pick.path,
    client,
    status,
    latency: lat,
  };
}
function pickWeighted(items) {
  const total = items.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const it of items) { r -= it.w; if (r <= 0) return it.v; }
  return items[items.length - 1].v;
}

export { ServiceMonitor };
