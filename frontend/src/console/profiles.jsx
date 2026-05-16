import React, { useState } from "react";
import { Icon } from "./shared.jsx";

// ---- All sandbox images shipped with MatrixLab ----
const MATRIXLAB_IMAGES = [
  { id: "matrixlab-python", label: "Python",   runtime: "Python 3.11", tools: "pip · pytest · ruff · mypy",
    gradient: "linear-gradient(135deg, #2563eb, #0ea5e9)", size: "182 MB" },
  { id: "matrixlab-node",   label: "Node.js",  runtime: "Node 20 LTS",  tools: "npm · pnpm · vitest · biome",
    gradient: "linear-gradient(135deg, #157f4a, #65a30d)", size: "210 MB" },
  { id: "matrixlab-go",     label: "Go",       runtime: "Go 1.22",      tools: "go test · golangci-lint",
    gradient: "linear-gradient(135deg, #0ea5e9, #06b6d4)", size: "165 MB" },
  { id: "matrixlab-rust",   label: "Rust",     runtime: "Rust 1.78",    tools: "cargo · clippy · rustfmt",
    gradient: "linear-gradient(135deg, #b13030, #dc2626)", size: "340 MB" },
  { id: "matrixlab-java",   label: "Java",     runtime: "Temurin 21",   tools: "maven · gradle · junit",
    gradient: "linear-gradient(135deg, #f59e0b, #dc2626)", size: "412 MB" },
  { id: "matrixlab-dotnet", label: ".NET",     runtime: ".NET 8",       tools: "dotnet · xunit",
    gradient: "linear-gradient(135deg, #7c3aed, #db2777)", size: "298 MB" },
  { id: "matrixlab-build",  label: "Build",    runtime: "Multi-runtime","tools": "Docker-in-Docker · all langs",
    gradient: "linear-gradient(135deg, #f59e0b, #b13030)", size: "1.2 GB" },
  { id: "matrixlab-utils",  label: "Utils",    runtime: "Alpine 3.20",  tools: "bash · git · curl · jq",
    gradient: "linear-gradient(135deg, #475569, #0f172a)", size: "38 MB" },
];

const CATEGORIES = ["Test", "Build", "CI", "Lint", "Custom"];

const COMMAND_TEMPLATES = {
  "matrixlab-python": ["pytest -q", "python -m unittest", "python -m mypy src/", "ruff check ."],
  "matrixlab-node":   ["npm test", "npm run build", "pnpm vitest run", "biome check ."],
  "matrixlab-go":     ["go test ./...", "go build ./...", "golangci-lint run"],
  "matrixlab-rust":   ["cargo test", "cargo build --release", "cargo clippy -- -D warnings"],
  "matrixlab-java":   ["mvn test", "gradle test", "mvn package -DskipTests"],
  "matrixlab-dotnet": ["dotnet test", "dotnet build", "dotnet format --verify-no-changes"],
  "matrixlab-build":  ["make ci", "make test build", "./scripts/release.sh"],
  "matrixlab-utils":  ["bash run.sh", "./scripts/check.sh", "make"],
};

const SETUP_TEMPLATES = {
  "matrixlab-python": "pip install -r requirements.txt",
  "matrixlab-node":   "npm ci",
  "matrixlab-go":     "go mod download",
  "matrixlab-rust":   "cargo fetch",
  "matrixlab-java":   "mvn dependency:resolve",
  "matrixlab-dotnet": "dotnet restore",
  "matrixlab-build":  "make setup",
  "matrixlab-utils":  "",
};

// Default seed profiles with the full shape the wizard understands.
const defaultProfiles = () => [
  { id: "p-python-test", name: "Python Test", description: "Standard pytest run", category: "Test",
    image: "matrixlab-python", command: "pytest -q",
    setupCommand: "pip install -r requirements.txt",
    setupNetwork: "on", testNetwork: "off",
    cpu: 1, memory: 1024, timeout: 120,
    artifacts: true, artifactGlobs: ["coverage.xml", "junit.xml"] },
  { id: "p-node-build", name: "Node Build", description: "npm install + production build", category: "Build",
    image: "matrixlab-node", command: "npm run build",
    setupCommand: "npm ci",
    setupNetwork: "on", testNetwork: "off",
    cpu: 2, memory: 2048, timeout: 300,
    artifacts: true, artifactGlobs: ["dist/**", "build/**"] },
  { id: "p-go-test", name: "Go Test", description: "go test on all packages", category: "Test",
    image: "matrixlab-go", command: "go test ./...",
    setupCommand: "go mod download",
    setupNetwork: "on", testNetwork: "off",
    cpu: 2, memory: 2048, timeout: 120,
    artifacts: false, artifactGlobs: [] },
  { id: "p-rust-test", name: "Rust Test", description: "cargo test in release-debug mode", category: "Test",
    image: "matrixlab-rust", command: "cargo test",
    setupCommand: "cargo fetch",
    setupNetwork: "on", testNetwork: "off",
    cpu: 2, memory: 4096, timeout: 600,
    artifacts: false, artifactGlobs: [] },
  { id: "p-stack", name: "Full Stack Python + Node", description: "Multi-runtime CI for repos with both stacks", category: "CI",
    image: "matrixlab-build", command: "make ci",
    setupCommand: "make setup",
    setupNetwork: "on", testNetwork: "off",
    cpu: 2, memory: 4096, timeout: 600,
    artifacts: true, artifactGlobs: ["coverage.xml", "dist/**", "junit.xml"] },
  { id: "p-gitpilot", name: "GitPilot Enterprise", description: "Profile used by GitPilot for repo verification", category: "CI",
    image: "matrixlab-python", command: "matrixlab-sandbox run --cmd 'pytest -q'",
    setupCommand: "pip install -e .[test]",
    setupNetwork: "on", testNetwork: "off",
    cpu: 2, memory: 2048, timeout: 600,
    artifacts: true, artifactGlobs: ["coverage.xml", "report.html"] },
];

// ---- Profiles page ----
function Profiles() {
  const [profiles, setProfiles] = useState(defaultProfiles);
  const [wizard, setWizard] = useState(null); // null | "new" | profile object to edit
  const [filter, setFilter] = useState("All");

  const filtered = filter === "All"
    ? profiles
    : profiles.filter(p => p.category === filter);

  const handleSave = (data) => {
    if (data.id && profiles.some(p => p.id === data.id)) {
      setProfiles(ps => ps.map(p => p.id === data.id ? data : p));
    } else {
      setProfiles(ps => [...ps, { ...data, id: data.id || "p-" + Math.random().toString(36).slice(2, 8) }]);
    }
    setWizard(null);
  };

  const handleDuplicate = (p) => {
    const copy = { ...p, id: "p-" + Math.random().toString(36).slice(2, 8), name: p.name + " (copy)" };
    setProfiles(ps => [...ps, copy]);
  };

  const handleDelete = (id) => setProfiles(ps => ps.filter(p => p.id !== id));

  return (
    <div className="content wide">
      <div className="page-head">
        <div>
          <h1 className="page-title">Execution Profiles</h1>
          <p className="page-sub">Templates that bundle a runtime image, default command, and network policy.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setWizard("new")}>
            <Icon name="plus"/> New profile
          </button>
        </div>
      </div>

      <div className="grid-3">
        {profiles.map(p => (
          <div key={p.id} className="card card-pad">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 7,
                background: "var(--ml-accent-soft)", color: "var(--ml-accent)",
                display: "grid", placeItems: "center"
              }}>
                <Icon name="layers" size={15}/>
              </div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
            </div>
            <div className="kv" style={{ gridTemplateColumns: "90px 1fr", gap: "6px 10px", fontSize: 12.5 }}>
              <div className="k">Image</div><div className="v mono" style={{ fontSize: 11.5 }}>{p.image}</div>
              <div className="k">Command</div><div className="v mono" style={{ fontSize: 11.5,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.command}</div>
              <div className="k">Network</div><div className="v">{networkLabel(p)}</div>
              <div className="k">CPU</div><div className="v">{p.cpu} core{p.cpu > 1 ? "s" : ""}</div>
              <div className="k">Memory</div><div className="v">{p.memory < 1024 ? `${p.memory} MB` : `${p.memory / 1024 * 1} GB`}</div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              <button className="btn btn-sm" style={{ flex: 1 }}>Use profile</button>
              <button className="btn btn-sm" onClick={() => setWizard(p)} title="Edit profile">
                <Icon name="cog" size={12}/>
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => handleDuplicate(p)} title="Duplicate"><Icon name="copy" size={12}/></button>
            </div>
          </div>
        ))}
      </div>

      {wizard && (
        <ProfileWizard
          profile={wizard === "new" ? null : wizard}
          onClose={() => setWizard(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// Compact, friendly network label for the card.
function networkLabel(p) {
  if (p.setupNetwork === "off" && p.testNetwork === "off") return "Off";
  if (p.setupNetwork === "on"  && p.testNetwork === "on")  return "On";
  if (p.setupNetwork === "on"  && p.testNetwork === "off") return "On during setup";
  return "Custom";
}

// ---- Profile wizard ----
function ProfileWizard({ profile, onClose, onSave }) {
  const isEdit = !!profile;
  const blank = {
    name: "",
    description: "",
    category: "Test",
    image: "matrixlab-python",
    command: "pytest -q",
    setupCommand: "pip install -r requirements.txt",
    setupNetwork: "on",
    testNetwork: "off",
    cpu: 1,
    memory: 1024,
    timeout: 120,
    artifacts: true,
    artifactGlobs: ["coverage.xml"],
  };
  const [data, setData] = useState(profile || blank);
  const [step, setStep] = useState(0);

  // when image changes, refresh command/setup if user hasn't customized them yet
  const onImageChange = (id) => {
    setData(d => {
      const templates = COMMAND_TEMPLATES[id] || [];
      const setup = SETUP_TEMPLATES[id] ?? d.setupCommand;
      // only auto-replace command if it matches a template of the previous image (heuristic: keep if user changed it)
      const prevTemplates = COMMAND_TEMPLATES[d.image] || [];
      const cmdLooksAuto = prevTemplates.includes(d.command);
      return {
        ...d,
        image: id,
        command: cmdLooksAuto ? (templates[0] || d.command) : d.command,
        setupCommand: !d.setupCommand || SETUP_TEMPLATES[d.image] === d.setupCommand ? setup : d.setupCommand,
      };
    });
  };

  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  const addGlob = () => setData(d => ({ ...d, artifactGlobs: [...d.artifactGlobs, ""] }));
  const updateGlob = (i, v) => setData(d => ({ ...d, artifactGlobs: d.artifactGlobs.map((g, idx) => idx === i ? v : g) }));
  const removeGlob = (i) => setData(d => ({ ...d, artifactGlobs: d.artifactGlobs.filter((_, idx) => idx !== i) }));

  const steps = ["Basics", "Image", "Commands", "Isolation", "Artifacts"];
  const next = () => setStep(s => Math.min(s + 1, steps.length - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));

  const canSave = data.name.trim().length > 0;
  const selectedImage = MATRIXLAB_IMAGES.find(i => i.id === data.image);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 780, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div className="modal-head">
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
              {isEdit ? `Edit profile · ${profile.name}` : "New profile"}
            </h3>
            <div style={{ fontSize: 12, color: "var(--ml-text-3)", marginTop: 2 }}>
              {isEdit ? "Update sandbox image, commands, isolation, and artifact rules." : "Bundle a sandbox image, command, and policy into a reusable template."}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon name="x"/></button>
        </div>

        {/* compact step pills */}
        <div style={{ display: "flex", gap: 4, padding: "12px 20px 4px", flexShrink: 0 }}>
          {steps.map((label, i) => (
            <button key={i} onClick={() => setStep(i)}
              style={{
                flex: 1, border: 0, background: "transparent",
                padding: "8px 0 10px",
                fontSize: 12,
                fontWeight: step === i ? 600 : 500,
                color: step === i ? "var(--ml-accent)" : step > i ? "var(--ml-text)" : "var(--ml-text-3)",
                borderBottom: step === i ? "2px solid var(--ml-accent)" : "2px solid transparent",
                cursor: "pointer",
              }}>
              <span style={{
                display: "inline-flex", width: 18, height: 18, borderRadius: "50%",
                background: step > i ? "var(--ml-accent)" : "var(--ml-surface-2)",
                color: step > i ? "white" : (step === i ? "var(--ml-accent)" : "var(--ml-text-3)"),
                marginRight: 6,
                fontSize: 10.5, fontWeight: 700,
                alignItems: "center", justifyContent: "center",
              }}>{step > i ? "✓" : (i + 1)}</span>
              {label}
            </button>
          ))}
        </div>

        <div className="modal-body" style={{ overflowY: "auto", flex: 1, gap: 16 }}>
          {step === 0 && <StepBasics data={data} set={set}/>}
          {step === 1 && <StepImage data={data} onImageChange={onImageChange}/>}
          {step === 2 && <StepCommands data={data} set={set} image={selectedImage}/>}
          {step === 3 && <StepIsolation data={data} set={set}/>}
          {step === 4 && <StepArtifacts data={data} set={set} addGlob={addGlob} updateGlob={updateGlob} removeGlob={removeGlob}/>}
        </div>

        <div className="modal-foot" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ml-text-3)" }}>
            {data.image && selectedImage && (
              <>
                <div className="int-glyph" style={{
                  width: 18, height: 18, fontSize: 8, borderRadius: 4,
                  background: selectedImage.gradient,
                }}>{selectedImage.label.slice(0,2).toUpperCase()}</div>
                <span className="mono">{data.image}</span>
                <span>·</span>
                <span>{data.cpu}c · {data.memory < 1024 ? `${data.memory}M` : `${data.memory/1024}G`}</span>
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && <button className="btn" onClick={back}><Icon name="chevL" size={12}/> Back</button>}
            <button className="btn" onClick={onClose}>Cancel</button>
            {step < steps.length - 1 && <button className="btn btn-primary" onClick={next}>Continue <Icon name="chevR" size={12}/></button>}
            {step === steps.length - 1 && (
              <button className="btn btn-primary" onClick={() => onSave(data)} disabled={!canSave}>
                <Icon name="check" size={12}/> {isEdit ? "Save changes" : "Create profile"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Wizard steps ----
function StepBasics({ data, set }) {
  return (
    <>
      <div className="field">
        <label>Profile name</label>
        <input className="input" placeholder="e.g. Python service tests"
          value={data.name} onChange={e => set("name", e.target.value)}/>
        <span className="hint">Shown in the New Run wizard, integration configs, and GitPilot.</span>
      </div>
      <div className="field">
        <label>Description</label>
        <input className="input" placeholder="What this profile is for"
          value={data.description} onChange={e => set("description", e.target.value)}/>
      </div>
      <div className="field">
        <label>Category</label>
        <div className="segmented">
          {CATEGORIES.map(c => (
            <button key={c} className={data.category === c ? "on" : ""} onClick={() => set("category", c)}>{c}</button>
          ))}
        </div>
      </div>
    </>
  );
}

function StepImage({ data, onImageChange }) {
  return (
    <>
      <div className="field">
        <label>Base sandbox image</label>
        <span className="hint">All MatrixLab images are signed and built from <span className="mono">sandbox-*/</span> in the runner repo.</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {MATRIXLAB_IMAGES.map(img => {
          const selected = data.image === img.id;
          return (
            <button key={img.id} onClick={() => onImageChange(img.id)}
              style={{
                display: "flex", gap: 12, alignItems: "flex-start",
                padding: "12px 14px",
                border: `1px solid ${selected ? "var(--ml-accent)" : "var(--ml-border)"}`,
                background: selected ? "var(--ml-accent-soft)" : "var(--ml-surface)",
                borderRadius: 8,
                cursor: "pointer",
                textAlign: "left",
              }}>
              <div className="int-glyph" style={{
                width: 36, height: 36, fontSize: 12, borderRadius: 8,
                background: img.gradient,
              }}>
                {img.label.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{img.label}</span>
                  <span style={{ fontSize: 10.5, color: "var(--ml-text-3)", fontFamily: "var(--ml-mono)" }}>{img.size}</span>
                </div>
                <div className="mono" style={{ fontSize: 11.5, color: "var(--ml-text-3)" }}>{img.id}</div>
                <div style={{ fontSize: 12, color: "var(--ml-text-2)", marginTop: 4 }}>
                  {img.runtime}
                </div>
                <div style={{ fontSize: 11, color: "var(--ml-text-3)", marginTop: 2 }}>
                  {img.tools}
                </div>
              </div>
              {selected && (
                <div style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: "var(--ml-accent)", color: "white",
                  display: "grid", placeItems: "center", flexShrink: 0,
                }}>
                  <Icon name="check" size={11}/>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

function StepCommands({ data, set, image }) {
  const templates = COMMAND_TEMPLATES[data.image] || [];
  return (
    <>
      <div className="field">
        <label>Default command</label>
        <input className="input" style={{ fontFamily: "var(--ml-mono)" }}
          value={data.command} onChange={e => set("command", e.target.value)}
          placeholder="pytest -q"/>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          <span className="hint" style={{ marginRight: 4 }}>Templates for {image?.label}:</span>
          {templates.map(t => (
            <button key={t} className={`filter-chip ${data.command === t ? "on" : ""}`}
              onClick={() => set("command", t)}>{t}</button>
          ))}
        </div>
      </div>

      <div className="divider"/>

      <div className="field">
        <label>Setup command <span style={{ color: "var(--ml-text-3)", fontWeight: 400 }}>(optional)</span></label>
        <input className="input" style={{ fontFamily: "var(--ml-mono)" }}
          value={data.setupCommand} onChange={e => set("setupCommand", e.target.value)}
          placeholder="pip install -r requirements.txt"/>
        <span className="hint">Runs once when bootstrapping a cached environment. Skipped on direct runs.</span>
      </div>
    </>
  );
}

function StepIsolation({ data, set }) {
  return (
    <>
      <div className="field">
        <label>Network</label>
        <div className="grid-2">
          <div className="field">
            <label style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ml-text-3)" }}>Setup phase</label>
            <div className="segmented">
              <button className={data.setupNetwork === "on" ? "on" : ""} onClick={() => set("setupNetwork", "on")}>On — for installs</button>
              <button className={data.setupNetwork === "off" ? "on" : ""} onClick={() => set("setupNetwork", "off")}>Off</button>
            </div>
          </div>
          <div className="field">
            <label style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ml-text-3)" }}>Test phase</label>
            <div className="segmented">
              <button className={data.testNetwork === "off" ? "on" : ""} onClick={() => set("testNetwork", "off")}>Off — safest</button>
              <button className={data.testNetwork === "on" ? "on" : ""} onClick={() => set("testNetwork", "on")}>On</button>
            </div>
          </div>
        </div>
        <span className="hint">Best-practice: network on during setup (so deps install), off during the test command.</span>
      </div>

      <div className="divider"/>

      <div className="field">
        <label>Resources</label>
        <div className="grid-3">
          <div className="field">
            <label style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ml-text-3)" }}>CPU cores</label>
            <div className="segmented">
              {[1, 2, 4, 8].map(c => (
                <button key={c} className={data.cpu === c ? "on" : ""} onClick={() => set("cpu", c)}>{c}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ml-text-3)" }}>Memory</label>
            <div className="segmented">
              {[512, 1024, 2048, 4096].map(m => (
                <button key={m} className={data.memory === m ? "on" : ""} onClick={() => set("memory", m)}>
                  {m < 1024 ? `${m}M` : `${m / 1024}G`}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ml-text-3)" }}>Timeout</label>
            <div className="segmented">
              {[60, 120, 300, 600].map(t => (
                <button key={t} className={data.timeout === t ? "on" : ""} onClick={() => set("timeout", t)}>
                  {t < 60 ? `${t}s` : `${t / 60}m`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function StepArtifacts({ data, set, addGlob, updateGlob, removeGlob }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
        background: "var(--ml-surface-2)", borderRadius: 6 }}>
        <div className={`toggle ${data.artifacts ? "on" : ""}`} onClick={() => set("artifacts", !data.artifacts)}/>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Collect artifacts</div>
          <div style={{ fontSize: 12, color: "var(--ml-text-3)" }}>Pull matching files from the sandbox back to MatrixLab after the run.</div>
        </div>
      </div>

      {data.artifacts && (
        <div className="field">
          <label>Glob patterns</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.artifactGlobs.map((g, i) => (
              <div key={i} style={{ display: "flex", gap: 6 }}>
                <input className="input" style={{ fontFamily: "var(--ml-mono)", fontSize: 12.5 }}
                  value={g} onChange={e => updateGlob(i, e.target.value)}
                  placeholder="coverage.xml or dist/**"/>
                <button className="btn btn-ghost" onClick={() => removeGlob(i)}>
                  <Icon name="x" size={12}/>
                </button>
              </div>
            ))}
            <button className="btn btn-sm" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={addGlob}>
              <Icon name="plus" size={11}/> Add pattern
            </button>
          </div>
          <span className="hint">Relative to <span className="mono">/workspace</span>. Supports <span className="mono">**</span> globs.</span>
        </div>
      )}

      <div className="divider"/>

      <div style={{ fontSize: 12.5, color: "var(--ml-text-3)" }}>
        <strong style={{ color: "var(--ml-text-2)" }}>Summary:</strong>{" "}
        Profile <span className="mono" style={{ color: "var(--ml-text-2)" }}>{data.name || "(unnamed)"}</span>{" "}
        runs <span className="mono" style={{ color: "var(--ml-text-2)" }}>{data.command}</span>{" "}
        on <span className="mono" style={{ color: "var(--ml-text-2)" }}>{data.image}</span>{" "}
        with {data.cpu} CPU · {data.memory < 1024 ? `${data.memory} MB` : `${data.memory / 1024} GB`} · {data.timeout}s timeout
        {data.artifacts && data.artifactGlobs.filter(Boolean).length > 0 && (
          <>, collecting <span className="mono" style={{ color: "var(--ml-text-2)" }}>{data.artifactGlobs.filter(Boolean).join(", ")}</span></>
        )}.
      </div>
    </>
  );
}

export { Profiles };
