import React, { useState } from "react";
import { Icon, Pill, seedProfiles, seedEnvironments } from "./shared.jsx";

// ----- New Run wizard -----
function NewRun({ initialSource = "repo", onCancel, onLaunch }) {
  const [step, setStep] = useState(0);
  const [source, setSource] = useState(initialSource); // code | repo | workspace | env
  const [runtime, setRuntime] = useState({
    language: "Python",
    network: "off",
    timeout: 120,
    cpu: 1,
    memory: 1024,
  });
  const [code, setCode] = useState({
    language: "python",
    body: `print("Hello from MatrixLab sandbox")\n\nimport sys\nprint("Python", sys.version.split()[0])\n`,
    stdin: "",
  });
  const [repo, setRepo] = useState({
    url: "github.com/agent-matrix/matrixlab",
    branch: "main",
    command: "pytest -q",
    profile: "Python Test",
  });
  const [workspace, setWorkspace] = useState({
    file: null, command: "make test", profile: "Python Test",
  });
  const [envChoice, setEnvChoice] = useState("gitpilot-main");

  const steps = [
    "Choose source",
    "Choose runtime",
    source === "code" ? "Code" : source === "repo" ? "Repository" : source === "workspace" ? "Workspace" : "Environment",
    "Review",
  ];

  const next = () => setStep(s => Math.min(s + 1, 3));
  const back = () => setStep(s => Math.max(s - 1, 0));

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">New Run</h1>
          <p className="page-sub">Configure a safely isolated execution. Network is off by default.</p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>

      {/* Stepper */}
      <div className="stepper">
        {steps.map((label, i) => (
          <button key={i}
            className={`step ${step === i ? "current" : ""} ${step > i ? "done" : ""}`}
            onClick={() => i < step && setStep(i)}>
            <div className="num">{step > i ? <Icon name="check" size={12}/> : (i + 1)}</div>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {step === 0 && <StepSource source={source} setSource={setSource}/>}
      {step === 1 && <StepRuntime runtime={runtime} setRuntime={setRuntime} source={source}/>}
      {step === 2 && source === "code" && <StepCode code={code} setCode={setCode}/>}
      {step === 2 && source === "repo" && <StepRepo repo={repo} setRepo={setRepo}/>}
      {step === 2 && source === "workspace" && <StepWorkspace workspace={workspace} setWorkspace={setWorkspace}/>}
      {step === 2 && source === "env" && <StepEnv envChoice={envChoice} setEnvChoice={setEnvChoice}/>}
      {step === 3 && <StepReview source={source} runtime={runtime} code={code} repo={repo} workspace={workspace} envChoice={envChoice}/>}

      <div style={{ display: "flex", gap: 8, marginTop: 22, justifyContent: "space-between" }}>
        <div>
          {step > 0 && <button className="btn" onClick={back}><Icon name="chevL"/> Back</button>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {step < 3 && <button className="btn btn-primary" onClick={next}>Continue <Icon name="chevR"/></button>}
          {step === 3 && (
            <button className="btn btn-primary btn-lg" onClick={() => onLaunch({ source, runtime, code, repo, workspace, envChoice })}>
              <Icon name="play"/> Start Run
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Step 1 — Source
function StepSource({ source, setSource }) {
  const opts = [
    { id: "code",      title: "Code snippet",          sub: "Quick Python, Node, or Bash. Best for ad‑hoc checks.", icon: "code" },
    { id: "repo",      title: "Git repository",        sub: "Clone a public or private repo and run a command on a branch.", icon: "git" },
    { id: "workspace", title: "Uploaded ZIP",          sub: "Send a local workspace and execute commands inside it.", icon: "upload" },
    { id: "env",       title: "Existing environment",  sub: "Reuse a cached environment for fast repeat testing.", icon: "box" },
  ];
  return (
    <div className="card card-pad">
      <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>What do you want to run?</h3>
      <p style={{ margin: "0 0 16px", color: "var(--ml-text-3)", fontSize: 13 }}>
        Pick the source of execution. All choices run inside an isolated sandbox container.
      </p>
      <div className="radio-cards" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {opts.map(o => (
          <div key={o.id}
            className={`radio-card ${source === o.id ? "selected" : ""}`}
            onClick={() => setSource(o.id)}>
            <div className="radio-dot"/>
            <div style={{ flex: 1 }}>
              <div className="rc-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name={o.icon} size={15}/> {o.title}
              </div>
              <div className="rc-sub">{o.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Step 2 — Runtime
function StepRuntime({ runtime, setRuntime, source }) {
  const langs = ["Python", "Node.js", "Go", "Rust", "Build (custom)"];
  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Runtime</h3>
        <p style={{ margin: 0, color: "var(--ml-text-3)", fontSize: 13 }}>
          Safe defaults are preselected. You can override before launching.
        </p>
      </div>

      <div className="field">
        <label>Language / image</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {langs.map(l => (
            <button key={l}
              className={`filter-chip ${runtime.language === l ? "on" : ""}`}
              onClick={() => setRuntime({ ...runtime, language: l })}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label>Network</label>
          <div className="radio-cards">
            <div className={`radio-card ${runtime.network === "off" ? "selected" : ""}`}
                 onClick={() => setRuntime({ ...runtime, network: "off" })}>
              <div className="radio-dot"/>
              <div>
                <div className="rc-title">Off — safest</div>
                <div className="rc-sub">No outbound network. Recommended.</div>
              </div>
            </div>
            <div className={`radio-card ${runtime.network === "on" ? "selected" : ""}`}
                 onClick={() => setRuntime({ ...runtime, network: "on" })}>
              <div className="radio-dot"/>
              <div>
                <div className="rc-title">On — for installs</div>
                <div className="rc-sub">Allow package install or remote access.</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="field">
            <label>Timeout</label>
            <div className="segmented">
              {[60, 120, 300, 600].map(t => (
                <button key={t} className={runtime.timeout === t ? "on" : ""}
                        onClick={() => setRuntime({ ...runtime, timeout: t })}>
                  {t < 60 ? `${t}s` : t < 3600 ? `${t / 60}m` : `${t / 3600}h`}
                </button>
              ))}
            </div>
            <span className="hint">Sandbox is killed at this limit.</span>
          </div>
          <div className="field">
            <label>CPU cores</label>
            <div className="segmented">
              {[1, 2, 4, 8].map(t => (
                <button key={t} className={runtime.cpu === t ? "on" : ""}
                        onClick={() => setRuntime({ ...runtime, cpu: t })}>{t}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Memory</label>
            <div className="segmented">
              {[512, 1024, 2048, 4096].map(t => (
                <button key={t} className={runtime.memory === t ? "on" : ""}
                        onClick={() => setRuntime({ ...runtime, memory: t })}>
                  {t < 1024 ? `${t} MB` : `${t / 1024} GB`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Step 3a — Code
function StepCode({ code, setCode }) {
  const langs = [
    { id: "python", label: "Python" },
    { id: "node", label: "Node.js" },
    { id: "bash", label: "Bash" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="field">
          <label>Language</label>
          <div className="segmented">
            {langs.map(l => (
              <button key={l.id} className={code.language === l.id ? "on" : ""}
                onClick={() => setCode({ ...code, language: l.id })}>{l.label}</button>
            ))}
          </div>
        </div>
        <div className="code-editor">
          <div className="code-editor-head">
            <Icon name="terminal" size={13}/>
            <span>main.{code.language === "node" ? "js" : code.language === "bash" ? "sh" : "py"}</span>
            <span style={{ marginLeft: "auto" }}>UTF‑8 · LF</span>
          </div>
          <textarea
            value={code.body}
            onChange={e => setCode({ ...code, body: e.target.value })}
            spellCheck={false}
          />
        </div>
        <div className="field">
          <label>stdin <span style={{ color: "var(--ml-text-3)", fontWeight: 400 }}>(optional)</span></label>
          <textarea className="input" rows={2} value={code.stdin}
            onChange={e => setCode({ ...code, stdin: e.target.value })}
            placeholder="Input piped to your program"/>
        </div>
      </div>
    </div>
  );
}

// Step 3b — Repo
function StepRepo({ repo, setRepo }) {
  const templates = [
    { label: "Python tests",     cmd: "pytest -q" },
    { label: "Python compile",   cmd: "python -m compileall ." },
    { label: "Node build",       cmd: "npm run build" },
    { label: "Node test",        cmd: "npm test" },
    { label: "Go tests",         cmd: "go test ./..." },
    { label: "Rust tests",       cmd: "cargo test" },
  ];
  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="grid-2">
        <div className="field">
          <label>Repository URL</label>
          <div className="input-with-prefix">
            <span className="prefix">https://</span>
            <input className="input" value={repo.url} onChange={e => setRepo({ ...repo, url: e.target.value })}/>
          </div>
        </div>
        <div className="field">
          <label>Branch or ref</label>
          <input className="input" value={repo.branch} onChange={e => setRepo({ ...repo, branch: e.target.value })}/>
        </div>
      </div>
      <div className="field">
        <label>Profile</label>
        <select className="select" value={repo.profile} onChange={e => setRepo({ ...repo, profile: e.target.value })}>
          {seedProfiles.map(p => <option key={p.name}>{p.name}</option>)}
        </select>
        <span className="hint">A profile bundles image + default command + network policy.</span>
      </div>
      <div className="field">
        <label>Command</label>
        <input className="input" style={{ fontFamily: "var(--ml-mono)", fontSize: 13 }}
               value={repo.command} onChange={e => setRepo({ ...repo, command: e.target.value })}/>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
          <span className="hint" style={{ marginRight: 4 }}>Templates:</span>
          {templates.map(t => (
            <button key={t.label} className="filter-chip"
              onClick={() => setRepo({ ...repo, command: t.cmd })}>{t.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepWorkspace({ workspace, setWorkspace }) {
  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="field">
        <label>Upload ZIP</label>
        <div style={{
          border: "2px dashed var(--ml-border-strong)",
          borderRadius: "var(--ml-radius)",
          padding: "30px 20px",
          textAlign: "center",
          background: "var(--ml-surface-2)",
        }}>
          <div style={{ display: "grid", placeItems: "center", marginBottom: 10 }}>
            <Icon name="upload" size={22}/>
          </div>
          <div style={{ fontWeight: 500, fontSize: 13.5 }}>
            {workspace.file || "Drop a .zip file here, or click to browse"}
          </div>
          <div className="hint" style={{ marginTop: 4 }}>
            Max 50 MB · Excluded: .git, node_modules, virtualenvs, .env, private keys
          </div>
          <button className="btn btn-sm" style={{ marginTop: 12 }}
                  onClick={() => setWorkspace({ ...workspace, file: "my-app-2026-05-15.zip" })}>
            Choose file
          </button>
        </div>
      </div>
      <div className="field">
        <label>Profile</label>
        <select className="select" value={workspace.profile} onChange={e => setWorkspace({ ...workspace, profile: e.target.value })}>
          {seedProfiles.map(p => <option key={p.name}>{p.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Command</label>
        <input className="input" style={{ fontFamily: "var(--ml-mono)" }}
               value={workspace.command} onChange={e => setWorkspace({ ...workspace, command: e.target.value })}/>
      </div>
    </div>
  );
}

function StepEnv({ envChoice, setEnvChoice }) {
  const envs = seedEnvironments;
  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Pick a cached environment</h3>
        <div className="card-sub">Setup steps are skipped — runs start in ~1s.</div>
      </div>
      <div>
        {envs.map(e => (
          <div key={e.name} className="file-row" style={{ cursor: "pointer" }}
               onClick={() => setEnvChoice(e.name)}>
            <div className="radio-dot" style={{
              border: `1.5px solid ${envChoice === e.name ? "var(--ml-accent)" : "var(--ml-border-strong)"}`,
              width: 16, height: 16, borderRadius: "50%", marginRight: 4, position: "relative"
            }}>
              {envChoice === e.name && <span style={{
                position: "absolute", inset: 3, borderRadius: "50%",
                background: "var(--ml-accent)"
              }}/>}
            </div>
            <div style={{ flex: 1 }}>
              <div className="f-name">{e.name}</div>
              <div className="f-meta">{e.repo} · {e.branch} · {e.runtime}</div>
            </div>
            <Pill tone={e.status === "Ready" ? "success" : e.status === "Rebuilding" ? "warn" : "neutral"}>{e.status}</Pill>
            <div className="f-meta" style={{ minWidth: 70 }}>{e.lastBuilt}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Step 4 — Review
function StepReview({ source, runtime, code, repo, workspace, envChoice }) {
  const sourceLabel = { code: "Code snippet", repo: "Git repository", workspace: "Uploaded workspace", env: "Cached environment" }[source];
  const cmd = source === "code"
    ? `${code.language === "node" ? "node" : code.language === "bash" ? "bash" : "python"} main.${code.language === "node" ? "js" : code.language === "bash" ? "sh" : "py"}`
    : source === "repo" ? repo.command
    : source === "workspace" ? workspace.command
    : "pytest -q";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Review run</h3>
          <Pill tone="info">Sandbox isolated</Pill>
        </div>
        <div className="card-pad">
          <div className="kv">
            <div className="k">Source</div><div className="v">{sourceLabel}</div>
            {source === "repo" && <>
              <div className="k">Repository</div><div className="v mono">github.com/{repo.url.replace(/^.*github\.com\//, "")}</div>
              <div className="k">Branch</div><div className="v mono">{repo.branch}</div>
              <div className="k">Profile</div><div className="v">{repo.profile}</div>
            </>}
            {source === "code" && <>
              <div className="k">Language</div><div className="v">{code.language}</div>
              <div className="k">Code</div><div className="v mono" style={{ whiteSpace: "pre-wrap" }}>
                {code.body.split("\n").slice(0, 4).join("\n")}{code.body.split("\n").length > 4 ? "\n…" : ""}
              </div>
            </>}
            {source === "workspace" && <>
              <div className="k">Workspace</div><div className="v">{workspace.file || "(none selected)"}</div>
              <div className="k">Profile</div><div className="v">{workspace.profile}</div>
            </>}
            {source === "env" && <>
              <div className="k">Environment</div><div className="v">{envChoice}</div>
            </>}
            <div className="k">Command</div><div className="v mono">{cmd}</div>
            <div className="k">Image</div><div className="v mono">matrixlab-{runtime.language.toLowerCase().replace(".js", "").replace(" (custom)", "")}</div>
            <div className="k">Network</div><div className="v">{runtime.network === "off" ? "Off — no egress" : "On — allowlisted egress"}</div>
            <div className="k">Timeout</div><div className="v">{runtime.timeout}s</div>
            <div className="k">CPU / Memory</div><div className="v">{runtime.cpu} core{runtime.cpu>1?"s":""} · {runtime.memory < 1024 ? `${runtime.memory} MB` : `${runtime.memory / 1024} GB`}</div>
            <div className="k">Artifacts</div><div className="v">Enabled · retained 30 days</div>
            <div className="k">Workspace</div><div className="v">Isolated · destroyed after run</div>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Security posture</h3>
        </div>
        <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Bullet ok>Fresh container, no host filesystem</Bullet>
          <Bullet ok={runtime.network === "off"} warn={runtime.network === "on"}>
            Network {runtime.network === "off" ? "disabled" : "enabled (allowlist)"}
          </Bullet>
          <Bullet ok>Capability dropped: SYS_ADMIN, NET_RAW, MKNOD</Bullet>
          <Bullet ok>Read‑only workspace mount</Bullet>
          <Bullet ok>PID limit: 256</Bullet>
          <Bullet ok>Resources capped: {runtime.cpu} CPU · {runtime.memory} MB</Bullet>
          <Bullet ok>Audit log: this run will be signed and stored</Bullet>
        </div>
      </div>
    </div>
  );
}

function Bullet({ ok, warn, children }) {
  const tone = warn ? "warn" : ok ? "success" : "neutral";
  const icon = warn ? "info" : ok ? "check" : "x";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
      <span className={`pill ${tone}`} style={{ width: 22, height: 22, padding: 0, justifyContent: "center" }}>
        <Icon name={icon} size={12}/>
      </span>
      <span>{children}</span>
    </div>
  );
}

export { NewRun };
