// frontend/src/console/api.js
//
// Thin client over the MatrixLab Runner HTTP contract.  Two shapes:
//
//   1. Same-origin / dev:  the Vite dev server proxies ``/api-runner/*``
//      to the configured runner URL (``vite.config.js``).  Callers POST
//      to ``/api-runner/code/run`` and the proxy strips the prefix.
//
//   2. Direct:             when the console is served by a static host
//      (Hugging Face Space, nginx), there is no proxy.  ``getSettings()``
//      returns a fully-qualified ``runnerUrl`` and we hit it directly.
//
// The Connection settings (runner URL + bearer token + polling interval)
// persist in ``localStorage`` so the console survives reloads.  Nothing
// is sent anywhere except to the user-configured runner.

const STORAGE_KEY = "matrixlab.connection";
const DEFAULTS = Object.freeze({
  runnerUrl: "",        // empty → use the Vite proxy path (same origin)
  bearerToken: "",
  pollSeconds: 5,
});

export function getSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch) {
  const merged = { ...getSettings(), ...patch };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); }
  catch { /* private mode / quota — fall through */ }
  return merged;
}

function resolveBaseUrl() {
  const s = getSettings();
  if (s.runnerUrl) return s.runnerUrl.replace(/\/+$/, "");
  // Default: hit the Vite proxy.  When the bundle is served statically
  // there is no proxy, so callers MUST configure a runnerUrl from the
  // Settings modal — surface that as a clear error rather than guess.
  if (typeof window !== "undefined" && window.location && window.location.port === "5273") {
    return "/api-runner"; // dev proxy
  }
  return "";
}

function authHeaders() {
  const s = getSettings();
  return s.bearerToken ? { Authorization: `Bearer ${s.bearerToken}` } : {};
}

async function request(path, { method = "GET", body, signal, timeoutMs = 15000 } = {}) {
  const base = resolveBaseUrl();
  if (!base) {
    throw new Error("Runner URL not configured. Open Settings to set it.");
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: signal || ctrl.signal,
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); }
      catch { data = { raw: text }; }
    }
    if (!res.ok) {
      const detail = (data && (data.detail || data.error)) || text || res.statusText;
      const err = new Error(`HTTP ${res.status} ${path}: ${detail}`);
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// ----------------------------------------------------------------------
// Endpoints used by the console.  Each one is a thin wrapper so swapping
// transport (e.g. WebSocket for /runs/{id}/events) only touches this file.

export const api = {
  health:       () => request("/health",       { timeoutMs: 4000 }),
  capabilities: () => request("/capabilities", { timeoutMs: 4000 }),
  poolStatus:   () => request("/pool/status",  { timeoutMs: 4000 }),

  /**
   * POST /code/run — execute a single code snippet through the runner.
   *
   * @param {{language: "python"|"node"|"javascript"|"bash"|"sh", code: string,
   *         timeout?: number, packages?: string[], allow_network?: boolean,
   *         stdin?: string, image?: string}} req
   */
  codeRun: (req) => request("/code/run", {
    method: "POST",
    body: req,
    // /code/run can pull a multi-hundred-MB language image on first
    // use, then start a container and execute — generous timeout.
    timeoutMs: 5 * 60 * 1000,
  }),
};

// Convenience: a synchronous-feeling reachability probe useful for the
// topbar pill.  Returns { ok, version, error } and never throws.
export async function probeRuntime() {
  try {
    const data = await api.health();
    return { ok: true, version: data?.version || data?.runner?.version || null, raw: data };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

// React hook: poll /health + /capabilities + /pool/status on the user's
// configured interval.  Returns { health, capabilities, pool, error,
// loading, refresh } so every admin / dashboard panel binds to the same
// live snapshot without making redundant requests.
//
// Hook is imported via React's module resolution (`React.useState`,
// `React.useEffect`) so api.js stays JSX-free.
import { useEffect, useRef, useState, useCallback } from "react";

export function useRunnerState({ intervalMs } = {}) {
  const [state, setState] = useState({
    health: null, capabilities: null, pool: null,
    error: null, loading: true,
  });
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const next = { health: null, capabilities: null, pool: null, error: null, loading: false };
    const results = await Promise.allSettled([
      api.health(), api.capabilities(), api.poolStatus(),
    ]);
    const [h, c, p] = results;
    if (h.status === "fulfilled") next.health = h.value;
    if (c.status === "fulfilled") next.capabilities = c.value;
    if (p.status === "fulfilled") next.pool = p.value;
    const firstErr = results.find(r => r.status === "rejected");
    if (firstErr && next.health == null) next.error = firstErr.reason?.message || "Runner unreachable";
    if (aliveRef.current) setState(next);
    return next;
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    refresh();
    const period = Math.max(2000,
      Number(intervalMs) || (Number(getSettings().pollSeconds) * 1000) || 5000);
    const h = setInterval(refresh, period);
    return () => { aliveRef.current = false; clearInterval(h); };
  }, [refresh, intervalMs]);

  return { ...state, refresh };
}
