import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  Globe,
  Key,
  Layers,
  Lock,
  Package,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Terminal as TerminalIcon,
  X,
  Zap,
} from "lucide-react";

const DEFAULT_API_URL = import.meta.env.VITE_MATRIXLAB_API_URL || "http://localhost:8000";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function now() {
  return new Date().toLocaleTimeString([], { hour12: false });
}

function shortDigest(image) {
  let hash = 0;
  for (const ch of image) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `sha256:${hash.toString(16).padStart(8, "0")}...${image.length.toString(16).padStart(4, "0")}`;
}

function normalizeImageName(image) {
  return image.replace(/^matrix-lab-/, "matrixlab-").replace(/:latest$/, "");
}

function SandboxTerminal({ logs, activeId, onClose, onClear }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#020617] shadow-2xl ring-1 ring-white/5">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
            <div className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
          </div>
          <div className="mx-1 h-4 w-px bg-slate-700" />
          <div className="flex items-center gap-2">
            <TerminalIcon className="h-3.5 w-3.5 text-cyan-400" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {activeId ? `TTY: ${activeId}` : "KERNEL_LOG_SUBSYSTEM"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onClear}
            className="font-mono text-[10px] font-bold uppercase tracking-tighter text-slate-500 transition-colors hover:text-cyan-400"
          >
            [ Purge_Buffer ]
          </button>
          {onClose && (
            <button onClick={onClose} className="rounded-md p-1 transition-colors hover:bg-slate-800">
              <X className="h-4 w-4 text-slate-500" />
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto p-5 font-mono text-[12px] leading-relaxed">
        {logs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-slate-700">
            <TerminalIcon className="mb-3 h-10 w-10 opacity-20" />
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Null sequence detected</p>
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={`${log.time}-${i}`} className="mb-1.5 flex gap-4">
              <span className="shrink-0 select-none text-[10px] text-slate-600">[{log.time}]</span>
              <span
                className={cn(
                  "break-all",
                  log.type === "error"
                    ? "text-rose-400"
                    : log.type === "success"
                      ? "text-emerald-400"
                      : log.type === "cmd"
                        ? "font-bold text-cyan-400"
                        : "text-slate-300",
                )}
              >
                {log.type === "cmd" && <span className="mr-2 text-cyan-700">#</span>}
                {log.text}
              </span>
            </div>
          ))
        )}
        <div className="mt-3 flex items-center gap-2 text-cyan-400/30">
          <span className="h-4 w-2 animate-pulse bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ isOpen, onClose, settings, setSettings, onSave }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button aria-label="Close settings" className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-8 py-6">
          <div>
            <h3 className="text-xl font-black text-slate-900">Infrastructure Config</h3>
            <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-500">MatrixLab Admin Console</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-8 overflow-y-auto p-8">
          <section className="space-y-4">
            <h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              <Globe className="h-3 w-3" /> Runtime Environment
            </h4>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="ml-1 text-xs font-bold text-slate-700">Runner URL</span>
                <input
                  value={settings.apiUrl}
                  onChange={(e) => setSettings((prev) => ({ ...prev, apiUrl: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-cyan-500/10"
                />
              </label>
              <label className="space-y-2">
                <span className="ml-1 text-xs font-bold text-slate-700">Default Image</span>
                <select
                  value={settings.defaultImage}
                  onChange={(e) => setSettings((prev) => ({ ...prev, defaultImage: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-cyan-500/10"
                >
                  <option>python</option>
                  <option>node</option>
                  <option>go</option>
                  <option>rust</option>
                  <option>build</option>
                </select>
              </label>
            </div>
          </section>

          <section className="space-y-4">
            <h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              <Sliders className="h-3 w-3" /> Runner Controls
            </h4>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="ml-1 text-xs font-bold text-slate-700">Poll Interval</span>
                <select
                  value={settings.pollMs}
                  onChange={(e) => setSettings((prev) => ({ ...prev, pollMs: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-cyan-500/10"
                >
                  <option value={2000}>2 seconds</option>
                  <option value={5000}>5 seconds</option>
                  <option value={10000}>10 seconds</option>
                </select>
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                <span>
                  <span className="block text-xs font-bold text-slate-800">Allow network for test runs</span>
                  <span className="block text-[10px] text-slate-500">Warm pool stays disabled for networked runs</span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.allowNetwork}
                  onChange={(e) => setSettings((prev) => ({ ...prev, allowNetwork: e.target.checked }))}
                  className="h-4 w-4 accent-cyan-600"
                />
              </label>
            </div>
          </section>

          <section className="space-y-4">
            <h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              <Key className="h-3 w-3" /> Security Credentials
            </h4>
            <label className="space-y-2">
              <span className="ml-1 text-xs font-bold text-slate-700">Bearer Token</span>
              <input
                type="password"
                placeholder="Optional MATRIXLAB_BEARER_TOKEN"
                value={settings.token}
                onChange={(e) => setSettings((prev) => ({ ...prev, token: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-cyan-500/10"
              />
            </label>
          </section>

          <div className="border-t border-slate-100 pt-4">
            <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-100 bg-rose-50/30 py-3 text-xs font-bold text-rose-600 transition-all hover:bg-rose-50">
              <ShieldAlert className="h-4 w-4" /> TERMINATE ALL ACTIVE SESSIONS (coming soon)
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-8 py-5">
          <button onClick={onClose} className="px-5 py-2 text-xs font-bold text-slate-500 transition-colors hover:text-slate-700">
            Cancel
          </button>
          <button onClick={onSave} className="flex items-center gap-2 rounded-xl bg-cyan-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-cyan-100 transition-all hover:bg-cyan-700">
            <Save className="h-3.5 w-3.5" /> Persist Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function metricCard({ label, val, color, bg, icon: Icon }) {
  return (
    <div key={label} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300">
      <div className="mb-2 flex items-center justify-between">
        <div className={cn("rounded-lg p-1.5", bg)}>
          <Icon className={cn("h-4 w-4", color)} />
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      </div>
      <div className="text-3xl font-black text-slate-900">{val}</div>
    </div>
  );
}

export default function MatrixLabWarmPoolAdmin() {
  const [settings, setSettings] = useState(() => ({
    apiUrl: localStorage.getItem("matrixlab.apiUrl") || DEFAULT_API_URL,
    token: localStorage.getItem("matrixlab.token") || "",
    pollMs: Number(localStorage.getItem("matrixlab.pollMs") || 5000),
    defaultImage: localStorage.getItem("matrixlab.defaultImage") || "python",
    allowNetwork: localStorage.getItem("matrixlab.allowNetwork") === "1",
  }));
  const [health, setHealth] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [poolStatus, setPoolStatus] = useState(null);
  const [sandboxHealth, setSandboxHealth] = useState(null);
  const [activeSandbox, setActiveSandbox] = useState(null);
  const [query, setQuery] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [systemLogs, setSystemLogs] = useState([
    { time: now(), text: "MatrixLab admin console initialized.", type: "success" },
    { time: now(), text: "Waiting for Runner telemetry...", type: "info" },
  ]);
  const [sandboxLogs, setSandboxLogs] = useState({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  const apiBase = settings.apiUrl.replace(/\/$/, "");

  const pushLog = useCallback((text, type = "info", id = null) => {
    const entry = { time: now(), text, type };
    if (id) {
      setSandboxLogs((prev) => ({ ...prev, [id]: [...(prev[id] || []), entry].slice(-200) }));
    } else {
      setSystemLogs((prev) => [...prev, entry].slice(-200));
    }
  }, []);

  const apiFetch = useCallback(
    async (path, options = {}) => {
      const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
      if (settings.token) headers.Authorization = `Bearer ${settings.token}`;
      const response = await fetch(`${apiBase}${path}`, { ...options, headers });
      const text = await response.text();
      const data = text ? JSON.parse(text) : null;
      if (!response.ok) throw new Error(data?.detail || text || response.statusText);
      return data;
    },
    [apiBase, settings.token],
  );

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [healthData, capsData, poolData, sandboxData] = await Promise.allSettled([
        apiFetch("/health"),
        apiFetch("/capabilities"),
        apiFetch("/pool/status"),
        apiFetch("/sandboxes/health"),
      ]);
      if (healthData.status === "fulfilled") setHealth(healthData.value);
      if (capsData.status === "fulfilled") setCapabilities(capsData.value);
      if (poolData.status === "fulfilled") setPoolStatus(poolData.value);
      if (sandboxData.status === "fulfilled") setSandboxHealth(sandboxData.value);
      const rejected = [healthData, capsData, poolData, sandboxData].filter((item) => item.status === "rejected");
      if (rejected.length) pushLog(`Telemetry refresh degraded: ${rejected[0].reason.message}`, "error");
      else pushLog("Telemetry refresh completed.", "success");
    } catch (error) {
      pushLog(`Telemetry refresh failed: ${error.message}`, "error");
    } finally {
      setIsRefreshing(false);
    }
  }, [apiFetch, pushLog]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, settings.pollMs);
    return () => clearInterval(timer);
  }, [refresh, settings.pollMs]);

  const saveSettings = () => {
    localStorage.setItem("matrixlab.apiUrl", settings.apiUrl);
    localStorage.setItem("matrixlab.token", settings.token);
    localStorage.setItem("matrixlab.pollMs", String(settings.pollMs));
    localStorage.setItem("matrixlab.defaultImage", settings.defaultImage);
    localStorage.setItem("matrixlab.allowNetwork", settings.allowNetwork ? "1" : "0");
    setIsSettingsOpen(false);
    pushLog("Admin console settings persisted.", "success");
    refresh();
  };

  const pools = useMemo(() => {
    const aliases = capabilities?.image_aliases || {};
    const images = new Set([...(poolStatus?.images || []), ...Object.keys(aliases)]);
    return [...images].map((image) => {
      const resolved = aliases[image] || image;
      const ready = poolStatus?.pools?.[resolved] || poolStatus?.pools?.[image] || 0;
      const provisioning = poolStatus?.provisioning?.[resolved] || poolStatus?.provisioning?.[image] || 0;
      const failed = poolStatus?.errors?.[resolved] || poolStatus?.errors?.[image] ? 1 : 0;
      return {
        image: normalizeImageName(resolved),
        rawImage: resolved,
        digest: shortDigest(resolved),
        min: poolStatus?.min_warm ?? 0,
        max: poolStatus?.max_warm ?? 0,
        ready,
        active: 0,
        provisioning,
        failed,
        avgAcquireMs: ready > 0 ? 8 : 0,
        networkPolicy: "Isolated while warm",
      };
    });
  }, [capabilities, poolStatus]);

  const sandboxes = useMemo(() => {
    const rows = [];
    for (const pool of pools) {
      if (pool.ready) {
        rows.push({
          id: `pool-${pool.rawImage}-ready`,
          image: pool.image,
          state: "READY_AND_SLEEPING",
          network: "none",
          age: "warm",
          owner: "pool-manager",
          cpu: "0%",
          memory: "paused",
        });
      }
      if (pool.provisioning) {
        rows.push({
          id: `pool-${pool.rawImage}-provisioning`,
          image: pool.image,
          state: "PROVISIONING",
          network: "none",
          age: "now",
          owner: "pool-manager",
          cpu: "n/a",
          memory: "n/a",
        });
      }
      if (pool.failed) {
        rows.push({
          id: `pool-${pool.rawImage}-failed`,
          image: pool.image,
          state: "FAILED_HEALTHCHECK",
          network: "none",
          age: "recent",
          owner: "pool-manager",
          cpu: "0%",
          memory: "0 MB",
        });
      }
    }

    const healthSandboxes = sandboxHealth?.sandboxes || {};
    for (const [name, value] of Object.entries(healthSandboxes)) {
      rows.push({
        id: `health-${name}`,
        image: value.image || name,
        state: value.ok ? "HEALTHY_IMAGE" : "FAILED_HEALTHCHECK",
        network: "n/a",
        age: "probe",
        owner: "sandbox-health",
        cpu: "n/a",
        memory: "n/a",
      });
    }
    return rows.filter((row) => row.id.toLowerCase().includes(query.toLowerCase()) || row.image.toLowerCase().includes(query.toLowerCase()));
  }, [pools, query, sandboxHealth]);

  const totals = useMemo(
    () =>
      pools.reduce(
        (acc, pool) => ({
          ready: acc.ready + pool.ready,
          active: acc.active + pool.active,
          provisioning: acc.provisioning + pool.provisioning,
          failed: acc.failed + pool.failed,
        }),
        { ready: 0, active: 0, provisioning: 0, failed: 0 },
      ),
    [pools],
  );

  const runHello = async () => {
    const id = `run-${Date.now()}`;
    setActiveSandbox(id);
    pushLog("POST /code/run hello-python", "cmd", id);
    try {
      const result = await apiFetch("/code/run", {
        method: "POST",
        body: JSON.stringify({
          language: "python",
          code: "print('Hello from MatrixLab admin sandbox')",
          image: settings.defaultImage,
          allow_network: settings.allowNetwork,
          timeout: 120,
          metadata: { source: "matrixlab-admin", action: "hello-python" },
        }),
      });
      setActiveSandbox(result.sandbox_id || id);
      pushLog(`sandbox_id=${result.sandbox_id} exit_code=${result.exit_code} duration_ms=${result.duration_ms}`, result.exit_code === 0 ? "success" : "error", result.sandbox_id || id);
      if (result.stdout) pushLog(result.stdout.trim(), "info", result.sandbox_id || id);
      if (result.stderr) pushLog(result.stderr.trim(), "error", result.sandbox_id || id);
      if (result.artifacts?.length) pushLog(`artifacts=${result.artifacts.map((a) => a.name).join(", ")}`, "success", result.sandbox_id || id);
    } catch (error) {
      pushLog(`hello-python failed: ${error.message}`, "error", id);
    }
  };

  const handleInspect = (id) => {
    setActiveSandbox(id);
    if (!sandboxLogs[id]) {
      pushLog(`Inspecting ${id}`, "cmd", id);
      pushLog("Attach simulated terminal; use Run Hello to create live execution logs.", "info", id);
    }
  };

  const healthOk = Boolean(health?.ok);

  return (
    <div className="min-h-screen bg-slate-50 p-4 font-sans text-slate-800 selection:bg-cyan-100 selection:text-cyan-900 sm:p-8">
      <div className="pointer-events-none fixed inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(#000 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={settings} setSettings={setSettings} onSave={saveSettings} />

      <div className="relative mx-auto max-w-[1600px] space-y-8">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 shadow-sm">
              <ShieldCheck className={cn("h-3.5 w-3.5", healthOk ? "text-cyan-600" : "text-rose-500")} /> Runner: {healthOk ? "reachable" : "degraded"}
            </div>
            <h1 className="flex items-center gap-3 text-4xl font-black tracking-tight text-slate-900">
              MATRIX<span className="font-light tracking-widest text-cyan-600">LABS</span>
            </h1>
            <p className="font-mono text-xs text-slate-500">{apiBase} • {capabilities?.protocol || "protocol pending"}</p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button onClick={refresh} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50">
              <RefreshCcw className={cn("h-3.5 w-3.5 text-slate-400", isRefreshing && "animate-spin text-cyan-600")} /> Sync Cluster
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="group rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition-all hover:border-cyan-200 hover:text-cyan-600">
              <Settings className="h-5 w-5 transition-transform group-hover:rotate-45" />
            </button>
            <button onClick={runHello} className="flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-cyan-200 transition-all hover:bg-cyan-700 active:scale-95">
              <Zap className="h-3.5 w-3.5" /> Run Hello
            </button>
          </div>
        </header>

        <div className="grid min-h-[700px] gap-6 lg:grid-cols-12 lg:h-[calc(100vh-220px)]">
          <div className="flex flex-col gap-6 overflow-hidden lg:col-span-7">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: "Sleeping", val: totals.ready, color: "text-cyan-600", bg: "bg-cyan-50", icon: PauseCircle },
                { label: "Active", val: totals.active, color: "text-emerald-600", bg: "bg-emerald-50", icon: PlayCircle },
                { label: "Buffer", val: totals.provisioning, color: "text-amber-600", bg: "bg-amber-50", icon: RefreshCcw },
                { label: "Faulted", val: totals.failed, color: "text-rose-600", bg: "bg-rose-50", icon: AlertTriangle },
              ].map(metricCard)}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {pools.map((pool) => (
                <div key={pool.rawImage} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-black text-slate-900"><Package className="h-4 w-4 text-cyan-600" /> {pool.image}</div>
                      <p className="mt-1 font-mono text-[10px] text-slate-400">{pool.digest}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500">{pool.networkPolicy}</span>
                  </div>
                  <div className="mt-5 grid grid-cols-4 gap-2 text-center">
                    <div><div className="text-xl font-black text-cyan-600">{pool.ready}</div><div className="text-[9px] font-bold uppercase text-slate-400">ready</div></div>
                    <div><div className="text-xl font-black text-emerald-600">{pool.active}</div><div className="text-[9px] font-bold uppercase text-slate-400">active</div></div>
                    <div><div className="text-xl font-black text-amber-600">{pool.provisioning}</div><div className="text-[9px] font-bold uppercase text-slate-400">build</div></div>
                    <div><div className="text-xl font-black text-rose-600">{pool.failed}</div><div className="text-[9px] font-bold uppercase text-slate-400">failed</div></div>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <span>min/max {pool.min}/{pool.max}</span>
                    <span>avg acquire {pool.avgAcquireMs}ms</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-5">
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <Layers className="h-4 w-4 text-cyan-600" /> Live Workload Registry
                </h2>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    placeholder="Filter by image or UUID..."
                    className="w-56 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs text-slate-700 outline-none transition-all focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/10"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase text-slate-400">
                    <tr><th className="px-6 py-4">Resource ID</th><th className="px-6 py-4">Telemetry</th><th className="px-6 py-4 text-right">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sandboxes.length === 0 ? (
                      <tr><td colSpan={3} className="px-6 py-12 text-center text-xs font-bold uppercase tracking-widest text-slate-400">No warm sandboxes reported yet</td></tr>
                    ) : sandboxes.map((sbx) => (
                      <tr key={sbx.id} className={cn("group cursor-pointer transition-all", activeSandbox === sbx.id ? "bg-cyan-50/50" : "hover:bg-slate-50/50")} onClick={() => handleInspect(sbx.id)}>
                        <td className="px-6 py-5"><div className="font-mono text-sm font-bold tracking-tight text-slate-900">{sbx.id}</div><div className="mt-0.5 text-[10px] font-medium text-slate-400">{sbx.image}</div></td>
                        <td className="px-6 py-5">
                          <div className="flex flex-wrap items-center gap-5">
                            <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><Cpu className="h-3 w-3 text-slate-400" /> {sbx.cpu}</span>
                            <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><Database className="h-3 w-3 text-slate-400" /> {sbx.memory}</span>
                            <span className={cn("rounded border px-2 py-0.5 text-[8px] font-black tracking-widest", sbx.state.includes("ACTIVE") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : sbx.state.includes("FAILED") ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-100 text-slate-500")}>{sbx.state.replace(/_/g, " ")}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-right"><button className={cn("inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all", activeSandbox === sbx.id ? "bg-cyan-600 text-white shadow-md shadow-cyan-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700")}><TerminalIcon className="h-3 w-3" /> TTY</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex flex-col overflow-hidden lg:col-span-5">
            <SandboxTerminal
              logs={activeSandbox ? sandboxLogs[activeSandbox] || [] : systemLogs}
              activeId={activeSandbox}
              onClear={() => (activeSandbox ? setSandboxLogs((prev) => ({ ...prev, [activeSandbox]: [] })) : setSystemLogs([]))}
              onClose={activeSandbox ? () => setActiveSandbox(null) : null}
            />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button onClick={() => pushLog(JSON.stringify(poolStatus || {}, null, 2), "cmd", activeSandbox)} className="group flex items-center justify-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 shadow-sm transition-all hover:border-cyan-500/50 hover:text-cyan-600">
                <Activity className="h-3.5 w-3.5 text-slate-300 transition-all group-hover:scale-110 group-hover:text-cyan-600" /> Pool_Status
              </button>
              <button onClick={() => pushLog(JSON.stringify(sandboxHealth || {}, null, 2), "cmd", activeSandbox)} className="group flex items-center justify-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 shadow-sm transition-all hover:border-cyan-500/50 hover:text-cyan-600">
                <CheckCircle2 className="h-3.5 w-3.5 text-slate-300 transition-all group-hover:scale-110 group-hover:text-cyan-600" /> Health_Check
              </button>
            </div>
          </div>
        </div>

        <footer className="flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-6 sm:flex-row">
          <p className="font-mono text-[10px] font-medium tracking-tight text-slate-400">
            API_ATTACHED: <span className="text-slate-600">{apiBase}</span> • WARM_POOL: <span className="text-slate-600">{poolStatus?.enabled ? "enabled" : "disabled"}</span>
          </p>
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3"><div className={cn("h-1.5 w-1.5 rounded-full", healthOk ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-rose-500")} /><span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">System: {healthOk ? "Nominal" : "Offline"}</span></div>
            <div className="flex items-center gap-3"><Lock className="h-3 w-3 text-slate-300" /><span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">{settings.token ? "Bearer Auth" : "No Token"}</span></div>
          </div>
        </footer>
      </div>
    </div>
  );
}
