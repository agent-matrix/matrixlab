import React from "react";
// Shared primitives, icons, and mock data for MatrixLab console.

// ----- Icons (inline, minimal) -----
const Icon = ({ name, size = 16, stroke = 1.6, className = "ico" }) => {
  const s = { width: size, height: size };
  const common = { fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    home: <><path {...common} d="M3 11.5 12 4l9 7.5"/><path {...common} d="M5 10v10h14V10"/></>,
    play: <path {...common} d="M6 4.5v15l13-7.5z"/>,
    list: <><path {...common} d="M4 6h16M4 12h16M4 18h16"/></>,
    file: <><path {...common} d="M7 3h8l4 4v14H7z"/><path {...common} d="M14 3v5h5"/></>,
    box: <><path {...common} d="m3 7 9-4 9 4-9 4-9-4z"/><path {...common} d="M3 7v10l9 4 9-4V7"/><path {...common} d="M12 11v10"/></>,
    layers: <><path {...common} d="m12 3 9 5-9 5-9-5z"/><path {...common} d="m3 13 9 5 9-5"/></>,
    shield: <path {...common} d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>,
    cog: <><circle {...common} cx="12" cy="12" r="3"/><path {...common} d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.1-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2.1 1.2L5.1 5.9 3.1 9.3l2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2.1 1.2L10 21h4l.5-2.6a7 7 0 0 0 2.1-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/></>,
    activity: <path {...common} d="M3 12h4l3-8 4 16 3-8h4"/>,
    search: <><circle {...common} cx="11" cy="11" r="7"/><path {...common} d="m20 20-3.5-3.5"/></>,
    plus: <><path {...common} d="M12 5v14M5 12h14"/></>,
    chevR: <path {...common} d="m9 6 6 6-6 6"/>,
    chevL: <path {...common} d="m15 6-6 6 6 6"/>,
    chevD: <path {...common} d="m6 9 6 6 6-6"/>,
    download: <><path {...common} d="M12 4v12"/><path {...common} d="m7 11 5 5 5-5"/><path {...common} d="M5 20h14"/></>,
    upload: <><path {...common} d="M12 20V8"/><path {...common} d="m7 13 5-5 5 5"/><path {...common} d="M5 4h14"/></>,
    eye: <><path {...common} d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle {...common} cx="12" cy="12" r="2.5"/></>,
    copy: <><rect {...common} x="9" y="9" width="11" height="11" rx="2"/><path {...common} d="M5 15V5a2 2 0 0 1 2-2h10"/></>,
    refresh: <><path {...common} d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path {...common} d="M21 3v5h-5"/><path {...common} d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path {...common} d="M3 21v-5h5"/></>,
    bell: <><path {...common} d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5z"/><path {...common} d="M10 20a2 2 0 0 0 4 0"/></>,
    git: <><circle {...common} cx="6" cy="6" r="2"/><circle {...common} cx="6" cy="18" r="2"/><circle {...common} cx="18" cy="12" r="2"/><path {...common} d="M6 8v8M8 18h2a4 4 0 0 0 4-4v0"/></>,
    code: <><path {...common} d="m9 8-5 4 5 4"/><path {...common} d="m15 8 5 4-5 4"/></>,
    zap: <path {...common} d="M13 3 5 14h6l-1 7 8-11h-6z"/>,
    check: <path {...common} d="m4 12 5 5L20 6"/>,
    x: <><path {...common} d="M6 6l12 12"/><path {...common} d="M18 6 6 18"/></>,
    clock: <><circle {...common} cx="12" cy="12" r="9"/><path {...common} d="M12 7v5l3 2"/></>,
    cpu: <><rect {...common} x="5" y="5" width="14" height="14" rx="2"/><rect {...common} x="9" y="9" width="6" height="6"/><path {...common} d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></>,
    db: <><ellipse {...common} cx="12" cy="5" rx="8" ry="3"/><path {...common} d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path {...common} d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
    folder: <path {...common} d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
    cloud: <path {...common} d="M7 18a5 5 0 0 1 0-10 7 7 0 0 1 13.5 2A4.5 4.5 0 0 1 17.5 18z"/>,
    terminal: <><path {...common} d="m5 8 4 4-4 4"/><path {...common} d="M12 18h7"/></>,
    info: <><circle {...common} cx="12" cy="12" r="9"/><path {...common} d="M12 11v5"/><circle cx="12" cy="8" r="1" fill="currentColor"/></>,
    more: <><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></>,
  };
  return <svg viewBox="0 0 24 24" style={s} className={className}>{paths[name] || null}</svg>;
};

// ----- Primitives -----
const Pill = ({ tone = "neutral", children, dot = true }) => (
  <span className={`pill ${tone}`}>
    {dot && <span className="dot"/>}
    {children}
  </span>
);
const StatCard = ({ label, value, meta, tone }) => (
  <div className="card stat">
    <div className="stat-label">{label}</div>
    <div className="stat-value" style={tone ? { color: `var(--ml-${tone})` } : undefined}>{value}</div>
    {meta && <div className="stat-meta">{meta}</div>}
  </div>
);

// status mapping for runs
const statusToTone = (s) => ({
  passed: "success", failed: "danger", timeout: "warn",
  running: "info", queued: "neutral", canceled: "neutral"
}[s] || "neutral");

// ----- Mock data -----
const seedRuns = [
  { id: "sbx-9j4lq2m", status: "passed", source: "repo",
    repo: "github.com/agent-matrix/matrixlab", branch: "main",
    command: "pytest -q", profile: "Python test",
    duration: 13.2, exit: 0, image: "matrixlab-python", network: "off",
    started: "10:46", startedAt: "2026-05-15 10:46:12",
    user: "ana.silva", artifacts: 2, output: "32 passed in 8.4s" },
  { id: "sbx-2k1abxc", status: "failed", source: "code",
    repo: null, branch: null,
    command: "node build.js", profile: "Node build",
    duration: 4.1, exit: 1, image: "matrixlab-node", network: "off",
    started: "10:39", startedAt: "2026-05-15 10:39:55",
    user: "sam.tan", artifacts: 0, output: "SyntaxError: Unexpected token" },
  { id: "sbx-71vgp9q", status: "passed", source: "repo",
    repo: "github.com/ruslanmv/gitpilot", branch: "feature/login",
    command: "pytest -q tests/", profile: "GitPilot Enterprise",
    duration: 28.7, exit: 0, image: "matrixlab-python", network: "on",
    started: "10:21", startedAt: "2026-05-15 10:21:03",
    user: "ana.silva", artifacts: 4, output: "117 passed in 23.1s" },
  { id: "sbx-mn82pkx", status: "timeout", source: "workspace",
    repo: null, branch: null,
    command: "cargo test", profile: "Rust test",
    duration: 120.0, exit: 124, image: "matrixlab-rust", network: "off",
    started: "10:08", startedAt: "2026-05-15 10:08:44",
    user: "kai.morrison", artifacts: 1, output: "timeout after 120s" },
  { id: "sbx-q3v0bm1", status: "running", source: "repo",
    repo: "github.com/ruslanmv/RepoGuardian", branch: "main",
    command: "make test", profile: "Full Stack Python + Node",
    duration: null, exit: null, image: "matrixlab-python", network: "off",
    started: "10:52", startedAt: "2026-05-15 10:52:00",
    user: "ana.silva", artifacts: 0, output: "" },
  { id: "sbx-4p9smk7", status: "passed", source: "code",
    repo: null, branch: null,
    command: "python hello.py", profile: "Python test",
    duration: 0.9, exit: 0, image: "matrixlab-python", network: "off",
    started: "09:55", startedAt: "2026-05-15 09:55:21",
    user: "dev.brown", artifacts: 0, output: "Hello from MatrixLab sandbox" },
  { id: "sbx-x2c4y8d", status: "failed", source: "repo",
    repo: "github.com/agent-matrix/matrix-hub", branch: "feat/search-v2",
    command: "pytest -q", profile: "Python test",
    duration: 18.4, exit: 1, image: "matrixlab-python", network: "off",
    started: "09:42", startedAt: "2026-05-15 09:42:11",
    user: "sam.tan", artifacts: 2, output: "3 failed, 28 passed" },
  { id: "sbx-7gh33lp", status: "passed", source: "code",
    repo: null, branch: null,
    command: "bash check.sh", profile: "Python test",
    duration: 2.1, exit: 0, image: "matrixlab-utils", network: "off",
    started: "09:28", startedAt: "2026-05-15 09:28:04",
    user: "kai.morrison", artifacts: 0, output: "ok" },
];

const seedArtifacts = {
  "sbx-9j4lq2m": [
    { name: "result.txt", size: "4 KB", kind: "TXT" },
    { name: "coverage.xml", size: "82 KB", kind: "XML" },
  ],
  "sbx-71vgp9q": [
    { name: "result.txt", size: "6 KB", kind: "TXT" },
    { name: "coverage.xml", size: "118 KB", kind: "XML" },
    { name: "junit.xml", size: "44 KB", kind: "XML" },
    { name: "screenshots.zip", size: "1.2 MB", kind: "ZIP" },
  ],
  "sbx-mn82pkx": [
    { name: "cargo.log", size: "212 KB", kind: "LOG" },
  ],
  "sbx-x2c4y8d": [
    { name: "result.txt", size: "9 KB", kind: "TXT" },
    { name: "junit.xml", size: "61 KB", kind: "XML" },
  ],
};

const seedEnvironments = [
  { name: "gitpilot-main", repo: "github.com/ruslanmv/gitpilot", branch: "main",
    runtime: "Python + Node", status: "Ready", lastBuilt: "2h ago" },
  { name: "matrix-hub-search", repo: "github.com/agent-matrix/matrix-hub", branch: "feat/search-v2",
    runtime: "Python", status: "Ready", lastBuilt: "1h ago" },
  { name: "repo-guardian", repo: "github.com/ruslanmv/RepoGuardian", branch: "main",
    runtime: "Python", status: "Rebuilding", lastBuilt: "12 min ago" },
  { name: "matrixlab-runner-rs", repo: "github.com/agent-matrix/matrixlab", branch: "rust-runner",
    runtime: "Rust", status: "Stale", lastBuilt: "3 days ago" },
];

const seedProfiles = [
  { name: "Python Test", image: "matrixlab-python", command: "pytest -q",
    network: "Off during test", cpu: "1 core", memory: "1024 MB" },
  { name: "Node Build", image: "matrixlab-node", command: "npm run build",
    network: "On during setup", cpu: "2 cores", memory: "2048 MB" },
  { name: "Go Test", image: "matrixlab-go", command: "go test ./...",
    network: "Off", cpu: "2 cores", memory: "2048 MB" },
  { name: "Rust Test", image: "matrixlab-rust", command: "cargo test",
    network: "Off", cpu: "2 cores", memory: "4096 MB" },
  { name: "Full Stack Python + Node", image: "matrixlab-build", command: "make ci",
    network: "On during setup", cpu: "2 cores", memory: "4096 MB" },
  { name: "GitPilot Enterprise", image: "matrixlab-python", command: "matrixlab-sandbox run --cmd 'pytest -q'",
    network: "On (setup) / Off (test)", cpu: "2 cores", memory: "2048 MB" },
];

const seedPool = [
  { image: "matrixlab-python", ready: 4, starting: 1, failed: 0, capacity: 6 },
  { image: "matrixlab-node",   ready: 3, starting: 0, failed: 0, capacity: 5 },
  { image: "matrixlab-go",     ready: 1, starting: 0, failed: 0, capacity: 3 },
  { image: "matrixlab-rust",   ready: 1, starting: 1, failed: 0, capacity: 3 },
  { image: "matrixlab-build",  ready: 0, starting: 0, failed: 1, capacity: 2 },
  { image: "matrixlab-utils",  ready: 2, starting: 0, failed: 0, capacity: 3 },
];

const seedLogs = (run) => {
  if (!run) return [];
  const out = [];
  out.push({ t: "info", text: `[runner] sandbox ${run.id} provisioned in 0.42s on matrixlab-runner-01` });
  out.push({ t: "info", text: `[runner] image ${run.image}@sha256:9d…3c4 · network=${run.network}` });
  out.push({ t: "dim", text: `[runner] workspace mounted /workspace (ro), tmp /sandbox-tmp (rw)` });
  out.push({ t: "cmd", text: `$ ${run.command}` });
  if (run.status === "passed") {
    out.push({ t: "out", text: "collected 32 items" });
    out.push({ t: "out", text: "tests/test_api.py ........................     [ 75%]" });
    out.push({ t: "out", text: "tests/test_models.py ........                    [100%]" });
    out.push({ t: "ok", text: `============== 32 passed in ${run.duration}s ==============` });
    out.push({ t: "info", text: `[runner] artifacts collected: 2 files, 86 KB` });
    out.push({ t: "info", text: `[runner] exit=0  duration=${run.duration}s` });
  } else if (run.status === "failed") {
    out.push({ t: "out", text: "collected 31 items" });
    out.push({ t: "out", text: "tests/test_api.py ......F.FF...........         [100%]" });
    out.push({ t: "err", text: "FAILED tests/test_api.py::test_create_session" });
    out.push({ t: "err", text: "FAILED tests/test_api.py::test_login_lockout" });
    out.push({ t: "err", text: "FAILED tests/test_api.py::test_oauth_callback" });
    out.push({ t: "err", text: `============= 3 failed, 28 passed in ${run.duration}s ==============` });
    out.push({ t: "info", text: `[runner] exit=${run.exit}  duration=${run.duration}s` });
  } else if (run.status === "timeout") {
    out.push({ t: "out", text: "    Compiling matrixlab-runtime v0.4.2" });
    out.push({ t: "out", text: "    Compiling tokio v1.34.0" });
    out.push({ t: "dim", text: "(building dependencies…)" });
    out.push({ t: "warn", text: `[runner] timeout 120s exceeded — SIGTERM dispatched` });
    out.push({ t: "err", text: `[runner] exit=124  duration=120.0s` });
  } else if (run.status === "running") {
    out.push({ t: "out", text: "Cloning github.com/ruslanmv/RepoGuardian@main…" });
    out.push({ t: "out", text: "Installing dependencies (cached)…" });
    out.push({ t: "info", text: "[runner] executing test command" });
  }
  return out;
};

export {
  Icon, Pill, StatCard, statusToTone,
  seedRuns, seedArtifacts, seedEnvironments, seedProfiles, seedPool, seedLogs,
};
