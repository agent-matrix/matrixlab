import React, { useState, useEffect, useRef } from "react";
import { Icon, Pill } from "./shared.jsx";
import { api } from "./api.js";

// Map the playground's display language names to the canonical
// language strings the runner's /code/run endpoint accepts.
const LANGUAGE_TO_RUNNER = {
  "Python":       "python",
  "Node.js":      "javascript",
  "JavaScript":   "javascript",
  "Bash":         "bash",
  "Shell":        "bash",
};

// ---- Lesson library ----
const LESSONS = {
  Python: [
    { id: "py-hello", title: "Hello, world", level: "Starter",
      desc: "Run your first program in an isolated Python sandbox.",
      code: 'print("Hello from MatrixLab sandbox")\nprint("Python ready.")' },
    { id: "py-vars", title: "Variables & types", level: "Starter",
      desc: "Numbers, strings, lists, dicts — and how Python prints them.",
      code: 'name = "Ana"\nage = 32\nlangs = ["python", "go", "rust"]\nprint(f"{name} is {age} and likes {langs}")' },
    { id: "py-loop", title: "Loops & ranges", level: "Beginner",
      desc: "for, range, and accumulators.",
      code: 'total = 0\nfor i in range(1, 11):\n    total += i\nprint("Sum 1..10 =", total)' },
    { id: "py-fn", title: "Functions", level: "Beginner",
      desc: "Define a function, return values, default arguments.",
      code: 'def greet(name, lang="en"):\n    if lang == "en": return f"Hello, {name}"\n    return f"Hola, {name}"\n\nprint(greet("Ana"))\nprint(greet("Ana", "es"))' },
    { id: "py-fetch", title: "Network: fetch a URL", level: "Intermediate",
      desc: "Requires network on. Demonstrates that the sandbox enforces egress rules.",
      code: 'import urllib.request\nr = urllib.request.urlopen("https://httpbin.org/uuid")\nprint(r.read().decode())' },
  ],
  JavaScript: [
    { id: "js-hello", title: "Hello, world", level: "Starter",
      desc: "console.log is captured and streamed back as logs.",
      code: 'console.log("Hello from MatrixLab sandbox")\nconsole.log("Node ready.")' },
    { id: "js-arr", title: "Array methods", level: "Beginner",
      desc: "map/filter/reduce.",
      code: 'const xs = [1,2,3,4,5,6,7,8,9,10]\nconst evens = xs.filter(x => x % 2 === 0)\nconst sum   = evens.reduce((a,b) => a+b, 0)\nconsole.log("evens:", evens)\nconsole.log("sum  :", sum)' },
    { id: "js-async", title: "async / await", level: "Intermediate",
      desc: "Promises, async functions, error handling.",
      code: 'async function main() {\n  const start = Date.now()\n  await new Promise(r => setTimeout(r, 250))\n  console.log("waited", Date.now() - start, "ms")\n}\nmain()' },
  ],
  Bash: [
    { id: "sh-hello", title: "Hello, world", level: "Starter",
      desc: "Basic shell commands.",
      code: 'echo "Hello from MatrixLab"\nwhoami\npwd\nls -la' },
    { id: "sh-find", title: "Find & count", level: "Beginner",
      desc: "Pipelines, find, wc.",
      code: 'find . -type f -name "*.py" | head -5\nfind . -type f | wc -l' },
  ],
};

const LANG_META = {
  Python:     { image: "matrixlab-python", icon: "code", ext: "py" },
  JavaScript: { image: "matrixlab-node",   icon: "code", ext: "js" },
  Bash:       { image: "matrixlab-utils",  icon: "terminal", ext: "sh" },
};

// ---- Simulated execution ----
// Note: this is a design prototype — execution is simulated so the demo is self-contained.
function fakeExecute(lang, code) {
  // returns { lines: [{t,text}], status, duration, exit }
  const lines = [];
  const start = performance.now();

  if (lang === "JavaScript") {
    // Run real JS in a try/catch with a captured console
    const captured = [];
    const origLog = console.log;
    const myLog = (...args) => captured.push(args.map(a =>
      typeof a === "object" ? JSON.stringify(a) : String(a)).join(" "));
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function("console", code);
      fn({ log: myLog, error: myLog, warn: myLog });
      captured.forEach(l => lines.push({ t: "out", text: l }));
      const dur = ((performance.now() - start) / 1000);
      return { lines, status: "passed", duration: dur.toFixed(2), exit: 0 };
    } catch (err) {
      lines.push({ t: "err", text: String(err) });
      return { lines, status: "failed", duration: "0.04", exit: 1 };
    } finally {
      console.log = origLog;
    }
  }

  if (lang === "Python") {
    // Tiny Python-ish simulator: handle print() and f-strings shallowly.
    // Enough to make the demo feel alive without bundling Pyodide.
    const env = {};
    const ctx = { env };
    const out = [];
    const err = (msg) => lines.push({ t: "err", text: msg });
    const printVal = (s) => lines.push({ t: "out", text: s });

    const evalPy = (expr) => {
      // f-string
      const fmatch = expr.match(/^f"(.*)"$|^f'(.*)'$/s);
      if (fmatch) {
        let s = (fmatch[1] ?? fmatch[2]);
        s = s.replace(/\{([^}]+)\}/g, (_, e) => String(evalPy(e.trim())));
        return s;
      }
      // string literal
      const sm = expr.match(/^"(.*)"$|^'(.*)'$/s);
      if (sm) return sm[1] ?? sm[2];
      // number
      if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
      // list literal (very loose)
      const lm = expr.match(/^\[(.*)\]$/);
      if (lm) return lm[1].split(",").map(s => evalPy(s.trim()));
      // env var
      if (env[expr] !== undefined) return env[expr];
      // arithmetic with env substitution — risky but ok for prototype
      try {
        const expr2 = expr.replace(/[A-Za-z_]\w*/g, (m) =>
          env[m] !== undefined ? JSON.stringify(env[m]) : m);
        // eslint-disable-next-line no-new-func
        const val = Function('"use strict"; return (' + expr2 + ")")();
        return val;
      } catch (e) { return expr; }
    };

    const lines2 = code.split("\n");
    let i = 0;
    while (i < lines2.length) {
      const raw = lines2[i];
      const line = raw.replace(/^\s+/, "");
      if (!line || line.startsWith("#")) { i++; continue; }
      // assignment
      const am = line.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
      const fm = line.match(/^def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:/);
      const pm = line.match(/^print\s*\((.*)\)\s*$/);
      const forM = line.match(/^for\s+(\w+)\s+in\s+range\(([^)]+)\)\s*:/);
      const ifM  = line.match(/^if\s+(.+)\s*:/);
      if (pm) {
        // split args by top-level commas
        const args = splitArgs(pm[1]).map(a => formatPy(evalPy(a)));
        printVal(args.join(" "));
        i++;
      } else if (fm) {
        // skip function defs — just register a stub
        env[fm[1]] = "<function>";
        // skip body
        i++;
        while (i < lines2.length && (lines2[i].startsWith(" ") || lines2[i].startsWith("\t") || lines2[i].trim() === "")) i++;
      } else if (forM) {
        const v = forM[1];
        const args = splitArgs(forM[2]).map(a => Number(evalPy(a)));
        const [a, b, s] = args.length === 1 ? [0, args[0], 1] : args.length === 2 ? [args[0], args[1], 1] : args;
        const body = [];
        i++;
        while (i < lines2.length && (lines2[i].startsWith("    ") || lines2[i].startsWith("\t"))) {
          body.push(lines2[i].replace(/^(    |\t)/, ""));
          i++;
        }
        for (let n = a; n < b; n += s) {
          env[v] = n;
          // re-run body with simple recursion
          const subResult = fakeExecute("Python", body.join("\n").replace(/^/gm, ""));
          // Merge env from the subResult is non-trivial — instead emulate only assignments/print here
          body.forEach(bl => {
            const bline = bl.replace(/^\s+/, "");
            const bpm = bline.match(/^print\s*\((.*)\)\s*$/);
            const bam = bline.match(/^([A-Za-z_]\w*)\s*(\+=|-=|\*=|=)\s*(.+)$/);
            if (bpm) {
              const args = splitArgs(bpm[1]).map(a => formatPy(evalPy(a)));
              printVal(args.join(" "));
            } else if (bam) {
              const cur = env[bam[1]] ?? 0;
              const val = evalPy(bam[3]);
              env[bam[1]] = bam[2] === "=" ? val :
                            bam[2] === "+=" ? (cur + val) :
                            bam[2] === "-=" ? (cur - val) :
                            bam[2] === "*=" ? (cur * val) : val;
            }
          });
        }
      } else if (am) {
        env[am[1]] = evalPy(am[2]);
        i++;
      } else if (ifM) {
        // skip if for prototype
        i++;
        while (i < lines2.length && (lines2[i].startsWith("    ") || lines2[i].startsWith("\t"))) i++;
      } else if (line.startsWith("import ") || line.startsWith("from ")) {
        // simulate import success
        i++;
      } else {
        // unrecognized — show as informational
        i++;
      }
    }
    if (lines.length === 0) {
      lines.push({ t: "dim", text: "(no output)" });
    }
    const dur = ((performance.now() - start) / 1000 + 0.42).toFixed(2);
    return { lines, status: "passed", duration: dur, exit: 0 };
  }

  // Bash — pattern recognize a few commands
  if (lang === "Bash") {
    code.split("\n").forEach(raw => {
      const cmd = raw.trim();
      if (!cmd || cmd.startsWith("#")) return;
      if (cmd.startsWith("echo ")) {
        const m = cmd.match(/^echo\s+(.*)$/);
        const t = (m[1] || "").replace(/^"(.*)"$|^'(.*)'$/, "$1$2");
        lines.push({ t: "out", text: t });
      } else if (cmd === "whoami") {
        lines.push({ t: "out", text: "sandbox" });
      } else if (cmd === "pwd") {
        lines.push({ t: "out", text: "/workspace" });
      } else if (cmd.startsWith("ls")) {
        lines.push({ t: "out", text: "total 4" });
        lines.push({ t: "out", text: "drwxr-xr-x  2 sandbox sandbox  4096 May 15 10:52 ." });
        lines.push({ t: "out", text: "-rw-r--r--  1 sandbox sandbox   142 May 15 10:52 README.md" });
      } else if (cmd.startsWith("find")) {
        lines.push({ t: "out", text: "./main.py" });
        lines.push({ t: "out", text: "./tests/test_api.py" });
      } else if (cmd.includes("| wc -l")) {
        lines.push({ t: "out", text: "    23" });
      } else {
        lines.push({ t: "dim", text: `[simulated] ${cmd}` });
      }
    });
    const dur = ((performance.now() - start) / 1000 + 0.31).toFixed(2);
    return { lines, status: "passed", duration: dur, exit: 0 };
  }
  return { lines: [{ t: "err", text: "Unsupported language" }], status: "failed", duration: "0", exit: 1 };
}

function splitArgs(s) {
  const out = []; let depth = 0; let last = 0; let inStr = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === inStr && s[i-1] !== "\\") inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === "(" || c === "[" || c === "{") depth++;
    if (c === ")" || c === "]" || c === "}") depth--;
    if (c === "," && depth === 0) { out.push(s.slice(last, i)); last = i + 1; }
  }
  out.push(s.slice(last));
  return out.map(x => x.trim()).filter(Boolean);
}

function formatPy(v) {
  if (Array.isArray(v)) return "[" + v.map(x => formatPy(x)).join(", ") + "]";
  if (typeof v === "string") return v.includes("\n") || v.length > 0 ? v : `'${v}'`;
  if (v === null || v === undefined) return "None";
  return String(v);
}

// ---- The page ----
function Playground() {
  const [lang, setLang] = useState("Python");
  const [network, setNetwork] = useState("off");
  const [showLessons, setShowLessons] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [sandboxes, setSandboxes] = useState([
    { id: "sbx-a3f9k7m", image: "matrixlab-python", status: "ready", network: "off",
      cpu: 1, memory: 1024, timeout: 120,
      createdAt: Date.now() - 92_000, ttl: 1800, runs: 1, active: true },
  ]);
  const [cells, setCells] = useState([
    {
      id: 1,
      lang: "Python",
      title: "Hello, world",
      note: "Try the playground — click Run on any cell to execute it inside an isolated sandbox.",
      code: 'print("Hello from MatrixLab sandbox")\nprint("Python ready.")',
      output: null,
      status: "idle",
      duration: null,
      sandboxId: "sbx-a3f9k7m",
    },
  ]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const nextId = useRef(2);

  // tick TTLs every 5s for the strip
  useEffect(() => {
    const i = setInterval(() => setSandboxes(s => s.map(x => ({ ...x }))), 5000);
    return () => clearInterval(i);
  }, []);

  const activeSandbox = sandboxes.find(s => s.active) || sandboxes[0];

  const setActive = (id) => setSandboxes(ss => ss.map(s => ({ ...s, active: s.id === id })));
  const terminate = (id) => {
    setSandboxes(ss => {
      const remaining = ss.filter(s => s.id !== id);
      // promote the next one if we deleted the active
      if (remaining.length && !remaining.some(s => s.active)) remaining[0].active = true;
      return remaining;
    });
  };

  const onSandboxCreated = (sbx) => {
    const newSbx = { ...sbx, active: true };
    // Append the new sandbox and mark it active; keep existing sandboxes in the strip.
    setSandboxes(ss => [newSbx, ...ss.map(s => ({ ...s, active: false }))]);

    // map image → cell language and starter code
    const imageToLang = {
      "matrixlab-python": "Python",
      "matrixlab-node":   "JavaScript",
      "matrixlab-utils":  "Bash",
      "matrixlab-build":  "Bash",
      "matrixlab-go":     "Bash",
      "matrixlab-rust":   "Bash",
    };
    const starters = {
      "Python":     `# Running in ${sbx.id}\nprint("Hello from", "${sbx.id}")\nprint("Python sandbox ready.")`,
      "JavaScript": `// Running in ${sbx.id}\nconsole.log("Hello from", "${sbx.id}")\nconsole.log("Node sandbox ready.")`,
      "Bash":       `# Running in ${sbx.id}\necho "Hello from ${sbx.id}"\nwhoami\npwd`,
    };
    const lang = imageToLang[sbx.image] || "Bash";
    const code = starters[lang];

    const id = nextId.current++;
    setCells(cs => [
      ...cs,
      {
        id, lang,
        title: `Smoke test · ${sbx.id}`,
        note: `Auto-added when ${sbx.id} (${sbx.image}) was created. Click Run to verify the sandbox.`,
        code,
        output: null, status: "idle", duration: null,
        sandboxId: newSbx.id,
        fresh: true,
      },
    ]);
    setTimeout(() => {
      const el = document.getElementById("cell-" + id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => {
        setCells(cs => cs.map(c => c.id === id ? { ...c, fresh: false } : c));
      }, 1800);
    }, 60);
  };

  const addCell = (lang, code = "", title = "Code cell", note = "") => {
    const id = nextId.current++;
    setCells(cs => [...cs, { id, lang, title, note, code, output: null, status: "idle", duration: null,
      sandboxId: activeSandbox ? activeSandbox.id : null }]);
    setTimeout(() => {
      const el = document.getElementById("cell-" + id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const removeCell = (id) => setCells(cs => cs.filter(c => c.id !== id));

  const runCell = async (id) => {
    setCells(cs => cs.map(c => c.id === id ? { ...c, status: "running", output: null } : c));
    const cell = cells.find(c => c.id === id);
    const startedAt = performance.now();

    // Real execution: ship the cell to the runner's /code/run.  Falls
    // back to the local fakeExecute if the runner is unconfigured or
    // unreachable, so the design preview still works without a backend.
    const runnerLang = LANGUAGE_TO_RUNNER[cell.lang];
    let resolved;
    if (runnerLang) {
      try {
        const resp = await api.codeRun({
          language: runnerLang,
          code: cell.code,
          timeout: 60,
          allow_network: network === "on",
        });
        // Strip the runner's "== Matrix Lab step: command ==" header
        // line so the cell shows program output only.
        const stdout = String(resp.stdout || "").replace(
          /^== Matrix Lab step: [^=]+ ==\r?\n/, "",
        );
        const stderr = String(resp.stderr || "");
        const lines = [
          ...stdout.split("\n"),
          ...(stderr ? ["", "[stderr]", ...stderr.split("\n")] : []),
        ].filter((_, i, a) => i < a.length - 1 || _.length > 0);
        resolved = {
          status: resp.exit_code === 0 ? "passed" : "failed",
          lines,
          duration: ((resp.duration_ms ?? (performance.now() - startedAt)) / 1000).toFixed(1),
          exit: resp.exit_code ?? -1,
        };
      } catch (err) {
        // Surface the failure inline rather than silently mocking, so
        // the operator sees the real cause (auth, network, language).
        resolved = {
          status: "failed",
          lines: [`[runner unreachable] ${err.message || String(err)}`],
          duration: ((performance.now() - startedAt) / 1000).toFixed(1),
          exit: -1,
        };
      }
    } else {
      // Unknown language → keep the design preview behaviour.
      await new Promise(r => setTimeout(r, 350));
      resolved = fakeExecute(cell.lang, cell.code);
    }

    setCells(cs => cs.map(c => c.id === id ? {
      ...c, status: resolved.status, output: resolved.lines,
      duration: resolved.duration, exit: resolved.exit,
    } : c));
    if (cell.sandboxId) {
      setSandboxes(ss => ss.map(s => s.id === cell.sandboxId ? { ...s, runs: (s.runs || 0) + 1 } : s));
    }
  };

  const runAll = async () => {
    for (const c of cells) {
      // eslint-disable-next-line no-await-in-loop
      await runCell(c.id);
    }
  };

  const loadLesson = (l, language) => {
    addCell(language, l.code, l.title, l.desc);
  };

  const askAssistant = async () => {
    if (!aiPrompt.trim() || aiBusy) return;
    setAiBusy(true);
    // create a pending cell immediately for nicer UX
    const id = nextId.current++;
    setCells(cs => [...cs, {
      id, lang, title: "Assistant generated",
      note: `Prompt: ${aiPrompt}`,
      code: "# generating…\n", output: null, status: "idle", duration: null,
    }]);
    setTimeout(() => {
      const el = document.getElementById("cell-" + id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 50);
    try {
      const sys = `You generate short, self-contained code snippets. Return ONLY the raw ${lang} code — no markdown, no fences, no commentary. Keep it under 20 lines. Use print/console.log to show output.`;
      const reply = await window.claude.complete({
        messages: [
          { role: "user", content: `${sys}\n\nTask: ${aiPrompt}` }
        ],
      });
      const cleaned = (reply || "").replace(/^```[a-z]*\n?/gim, "").replace(/```\s*$/g, "").trim();
      setCells(cs => cs.map(c => c.id === id ? { ...c, code: cleaned || "# no code returned" } : c));
    } catch (e) {
      setCells(cs => cs.map(c => c.id === id ? { ...c, code: "# error: " + String(e) } : c));
    } finally {
      setAiBusy(false);
      setAiPrompt("");
    }
  };

  return (
    <div className="content wide" style={{ paddingBottom: 100 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Sandbox Playground</h1>
          <p className="page-sub">Write, run, and learn — every cell executes in an isolated MatrixLab sandbox.</p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => setShowLessons(v => !v)}>
            <Icon name="folder" size={14}/> {showLessons ? "Hide lessons" : "Show lessons"}
          </button>
          <button className="btn" onClick={runAll}><Icon name="zap" size={14}/> Run all</button>
          <button className="btn" onClick={() => addCell(lang)}><Icon name="plus"/> New cell</button>
          <button className="btn btn-primary" onClick={() => setWizardOpen(true)}>
            <Icon name="box" size={14}/> New sandbox
          </button>
        </div>
      </div>

      <SandboxStrip
        sandboxes={sandboxes}
        onActivate={setActive}
        onTerminate={terminate}
        onNew={() => setWizardOpen(true)}
      />

      <div style={{
        display: "grid",
        gridTemplateColumns: showLessons ? "260px 1fr" : "1fr",
        gap: 16,
        alignItems: "start",
      }}>
        {showLessons && <LessonRail onPick={loadLesson}/>}

        <div style={{ minWidth: 0 }}>
          {/* Sandbox toolbar */}
          <div className="card card-pad" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12.5, color: "var(--ml-text-3)" }}>Default language</span>
              <div className="segmented">
                {Object.keys(LANG_META).map(l => (
                  <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l}</button>
                ))}
              </div>
            </div>
            <div style={{ width: 1, height: 24, background: "var(--ml-border)" }}/>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12.5, color: "var(--ml-text-3)" }}>Network</span>
              <div className={`toggle ${network === "on" ? "on" : ""}`} onClick={() => setNetwork(n => n === "on" ? "off" : "on")}/>
              <span style={{ fontSize: 12.5 }}>{network === "on" ? "Allowed (allowlist)" : "Off — safest"}</span>
            </div>
            <div style={{ width: 1, height: 24, background: "var(--ml-border)" }}/>
            <Pill tone="info" dot>{LANG_META[lang].image}</Pill>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
              <Pill tone="success">Pool: ready</Pill>
              <span style={{ fontSize: 12, color: "var(--ml-text-3)" }}>warm start ~0.4s</span>
            </div>
          </div>

          {/* Cells */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {cells.map((c, idx) => (
              <CodeCell key={c.id} cell={c} idx={idx}
                isActiveSandbox={activeSandbox && c.sandboxId === activeSandbox.id}
                onChange={(code) => setCells(cs => cs.map(x => x.id === c.id ? { ...x, code } : x))}
                onLangChange={(l) => setCells(cs => cs.map(x => x.id === c.id ? { ...x, lang: l } : x))}
                onRun={() => runCell(c.id)}
                onDelete={() => removeCell(c.id)}
              />
            ))}
            {cells.length === 0 && (
              <div className="card empty">No cells yet. Click "New cell" or load a lesson.</div>
            )}
          </div>

          {/* Assistant */}
          <div className="card" style={{ marginTop: 16,
            position: "sticky", bottom: 16, zIndex: 4,
          }}>
            <div className="card-head">
              <div>
                <h3 className="card-title">Ask the assistant</h3>
                <div className="card-sub">Describe what you want — the assistant drops a runnable {lang} cell into the notebook.</div>
              </div>
            </div>
            <div className="card-pad" style={{ display: "flex", gap: 10 }}>
              <input
                className="input"
                placeholder={`e.g. "Generate a ${lang} program that prints the first 10 Fibonacci numbers"`}
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") askAssistant(); }}
                disabled={aiBusy}
              />
              <button className="btn btn-primary" onClick={askAssistant} disabled={aiBusy || !aiPrompt.trim()}>
                {aiBusy ? <><Icon name="refresh" size={14} className="spin"/> Generating…</> : <><Icon name="zap" size={14}/> Generate & add</>}
              </button>
            </div>
          </div>
          <style>{`
            .spin { animation: ml-spin 1s linear infinite; }
            @keyframes ml-spin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      </div>

      {wizardOpen && (
        <SandboxWizard
          onClose={() => setWizardOpen(false)}
          onCreated={(sbx) => { onSandboxCreated(sbx); setWizardOpen(false); }}
          defaults={{ image: "matrixlab-python", network: "off", cpu: 1, memory: 1024, timeout: 120 }}
        />
      )}
    </div>
  );
}

function LessonRail({ onPick }) {
  return (
    <div className="card" style={{ position: "sticky", top: 76 }}>
      <div className="card-head">
        <h3 className="card-title">Lessons & recipes</h3>
      </div>
      <div style={{ padding: "6px 0 10px" }}>
        {Object.entries(LESSONS).map(([lang, items]) => (
          <div key={lang} style={{ marginBottom: 10 }}>
            <div style={{
              padding: "8px 16px 4px",
              fontSize: 10.5, fontWeight: 600, textTransform: "uppercase",
              color: "var(--ml-text-4)", letterSpacing: "0.06em"
            }}>{lang}</div>
            {items.map(it => (
              <button key={it.id} className="nav-item" style={{ width: "auto", margin: "0 8px", borderRadius: 6 }}
                onClick={() => onPick(it, lang)}>
                <span style={{
                  width: 4, height: 18, borderRadius: 2,
                  background: it.level === "Starter" ? "var(--ml-success)" :
                              it.level === "Beginner" ? "var(--ml-info)" :
                              "var(--ml-warning)",
                  flexShrink: 0
                }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ml-text)" }}>{it.title}</div>
                  <div style={{ fontSize: 11, color: "var(--ml-text-3)" }}>{it.level}</div>
                </div>
                <Icon name="plus" size={13}/>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CodeCell({ cell, idx, onChange, onLangChange, onRun, onDelete, isActiveSandbox }) {
  const { lang, title, note, code, output, status, duration, exit, fresh } = cell;
  const meta = LANG_META[lang];
  return (
    <div id={"cell-" + cell.id} className="card"
      style={{
        borderColor: isActiveSandbox ? "var(--ml-accent)" : "var(--ml-border)",
        boxShadow: isActiveSandbox ? "0 0 0 3px var(--ml-accent-soft)" :
                   fresh ? "0 0 0 4px var(--ml-success-soft)" : "none",
        transition: "border-color .2s, box-shadow .4s",
        position: "relative",
      }}>
      {fresh && (
        <div style={{
          position: "absolute", top: -10, left: 14,
          background: "var(--ml-success)", color: "white",
          fontSize: 10.5, fontWeight: 600, padding: "2px 8px",
          borderRadius: 999, letterSpacing: "0.04em",
          textTransform: "uppercase",
          animation: "cell-pop 0.4s ease-out",
        }}>
          Just added
        </div>
      )}
      <style>{`@keyframes cell-pop { from { opacity: 0; transform: translateY(-4px); } }`}</style>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px",
        borderBottom: "1px solid var(--ml-border)",
        background: "var(--ml-surface-2)",
      }}>
        <span style={{
          width: 22, height: 22, borderRadius: 6,
          background: "var(--ml-accent-soft)", color: "var(--ml-accent)",
          display: "grid", placeItems: "center",
          fontSize: 10.5, fontWeight: 700,
        }}>{idx + 1}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
          {note && <div style={{ fontSize: 11.5, color: "var(--ml-text-3)" }}>{note}</div>}
        </div>
        <div className="segmented" style={{ padding: 2 }}>
          {Object.keys(LANG_META).map(l => (
            <button key={l} className={lang === l ? "on" : ""}
              onClick={() => onLangChange(l)}
              style={{ padding: "3px 8px", fontSize: 11.5 }}>{l}</button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onDelete} title="Delete cell">
          <Icon name="x" size={13}/>
        </button>
      </div>

      <div className="code-editor" style={{ border: 0, borderRadius: 0 }}>
        <div className="code-editor-head" style={{ borderRadius: 0 }}>
          <Icon name={meta.icon} size={13}/>
          <span>cell-{cell.id}.{meta.ext}</span>
          <span style={{ marginLeft: "auto" }}>{lang} · {meta.image}</span>
        </div>
        <textarea
          value={code}
          onChange={e => onChange(e.target.value)}
          spellCheck={false}
          rows={Math.min(Math.max(code.split("\n").length, 3), 18)}
        />
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px",
        borderTop: "1px solid var(--ml-border)",
      }}>
        <button className="btn btn-primary btn-sm" onClick={onRun} disabled={status === "running"}>
          {status === "running" ? <><Icon name="refresh" size={12} className="spin"/> Running…</> : <><Icon name="play" size={12}/> Run</>}
        </button>
        {status !== "idle" && status !== "running" && (
          <>
            <Pill tone={status === "passed" ? "success" : "danger"}>{status}</Pill>
            <span style={{ fontSize: 12, color: "var(--ml-text-3)" }}>
              {duration}s · exit {exit}
            </span>
          </>
        )}
        {cell.sandboxId && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 11, color: "var(--ml-text-3)",
            fontFamily: "var(--ml-mono)",
            padding: "2px 7px", borderRadius: 4,
            background: "var(--ml-surface-2)",
          }} title="Sandbox this cell runs in">
            <Icon name="box" size={10}/> {cell.sandboxId}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(code)}>
            <Icon name="copy" size={12}/> Copy
          </button>
          <button className="btn btn-ghost btn-sm"><Icon name="download" size={12}/> Save</button>
        </div>
      </div>

      {(status === "running" || output) && (
        <div style={{ borderTop: "1px solid var(--ml-border)" }}>
          <div className="terminal" style={{
            borderRadius: 0,
            minHeight: 60, maxHeight: 280,
          }}>
            {status === "running" && (
              <span className="ln t-dim">
                [runner] provisioning sandbox… <span style={{
                  display: "inline-block", width: 8, height: 12,
                  background: "#c8d2dc", verticalAlign: "middle",
                  animation: "blink 1s infinite"
                }}/>
              </span>
            )}
            {output && output.map((l, i) => (
              <span key={i} className={`ln t-${l.t}`}>{l.text}</span>
            ))}
            {output && (
              <span className="ln t-dim" style={{ marginTop: 6, display: "block" }}>
                [runner] exit={exit} duration={duration}s · sandbox destroyed
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================
// Sandbox strip — horizontal chips, one per active sandbox.
// They stay in a single row; the row scrolls horizontally if needed.
// ===========================================================
function SandboxStrip({ sandboxes, onActivate, onTerminate, onNew }) {
  if (sandboxes.length === 0) {
    return (
      <div className="card card-pad" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <div className="int-glyph" style={{ background: "var(--ml-surface-2)", color: "var(--ml-text-3)", border: "1px dashed var(--ml-border-strong)" }}>
          <Icon name="box" size={16}/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 13.5 }}>No sandbox running</div>
          <div style={{ fontSize: 12.5, color: "var(--ml-text-3)" }}>
            Spin one up to start executing cells in an isolated environment.
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onNew}><Icon name="plus" size={12}/> Create sandbox</button>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex",
      flexWrap: "nowrap",          // never stack vertically
      gap: 10,
      marginBottom: 14,
      overflowX: "auto",           // scroll sideways if many
      paddingBottom: 4,
      alignItems: "stretch",
    }}>
      {sandboxes.map(s => (
        <SandboxChip key={s.id} sbx={s}
          onActivate={() => onActivate(s.id)}
          onTerminate={() => onTerminate(s.id)}
        />
      ))}
      <button className="btn btn-sm" onClick={onNew}
        style={{ alignSelf: "stretch", paddingLeft: 12, paddingRight: 14, whiteSpace: "nowrap", flexShrink: 0 }}>
        <Icon name="plus" size={12}/> New sandbox
      </button>
    </div>
  );
}

function SandboxChip({ sbx, onActivate, onTerminate }) {
  const ageS = Math.floor((Date.now() - sbx.createdAt) / 1000);
  const ttlLeft = Math.max(0, sbx.ttl - ageS);
  const ttlPct = (ttlLeft / sbx.ttl) * 100;
  const ttlClass = ttlPct < 15 ? "danger" : ttlPct < 35 ? "warn" : "success";
  return (
    <div className="card" style={{
      width: 260, minWidth: 260, flexShrink: 0,
      padding: "10px 12px",
      borderColor: sbx.active ? "var(--ml-accent)" : "var(--ml-border)",
      boxShadow: sbx.active ? "0 0 0 3px var(--ml-accent-soft)" : "none",
      cursor: "pointer",
    }} onClick={onActivate}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div className="int-glyph" style={{
          width: 22, height: 22, fontSize: 9.5, borderRadius: 5,
          background: sbx.image.includes("python") ? "linear-gradient(135deg, #2563eb, #0ea5e9)" :
                      sbx.image.includes("node")   ? "linear-gradient(135deg, #157f4a, #65a30d)" :
                      sbx.image.includes("rust")   ? "linear-gradient(135deg, #b13030, #dc2626)" :
                      sbx.image.includes("go")     ? "linear-gradient(135deg, #0ea5e9, #06b6d4)" :
                                                     "linear-gradient(135deg, #475569, #0f172a)",
        }}>
          {sbx.image.replace("matrixlab-", "").slice(0,2).toUpperCase()}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span className="mono" style={{ fontSize: 11.5, fontWeight: 600,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sbx.id}
            </span>
            {sbx.active && <span className="pill info" style={{ fontSize: 9.5, padding: "0 6px" }}><span className="dot"/>active</span>}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--ml-text-3)" }}>
            {sbx.image} · {sbx.network === "off" ? "no net" : "net on"} · {sbx.cpu}c/{sbx.memory < 1024 ? `${sbx.memory}M` : `${sbx.memory/1024}G`}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); onTerminate(); }}
          title="Terminate sandbox" style={{ padding: 4 }}>
          <Icon name="x" size={12}/>
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <Pill tone={sbx.status === "ready" ? "success" : "info"} dot>{sbx.status}</Pill>
        <div className={`bar ${ttlClass}`} style={{ flex: 1, height: 4 }}>
          <i style={{ width: `${ttlPct}%` }}/>
        </div>
        <span style={{ fontSize: 10.5, color: "var(--ml-text-3)",
          fontFamily: "var(--ml-mono)", minWidth: 36, textAlign: "right" }}>
          {formatTtl(ttlLeft)}
        </span>
      </div>
    </div>
  );
}

function formatTtl(s) {
  if (s >= 3600) return `${Math.floor(s/3600)}h${Math.floor((s%3600)/60)}m`;
  if (s >= 60) return `${Math.floor(s/60)}m${s%60}s`;
  return `${s}s`;
}

// ===========================================================
// Sandbox wizard — single-screen modal with live provisioning
// ===========================================================
const SBX_IMAGES = [
  { id: "matrixlab-python", label: "Python",  hint: "Python 3.11 · pip · pytest", gradient: "linear-gradient(135deg, #2563eb, #0ea5e9)" },
  { id: "matrixlab-node",   label: "Node.js", hint: "Node 20 · npm · vitest",     gradient: "linear-gradient(135deg, #157f4a, #65a30d)" },
  { id: "matrixlab-go",     label: "Go",      hint: "Go 1.22 · go test",          gradient: "linear-gradient(135deg, #0ea5e9, #06b6d4)" },
  { id: "matrixlab-rust",   label: "Rust",    hint: "Rust 1.78 · cargo",          gradient: "linear-gradient(135deg, #b13030, #dc2626)" },
  { id: "matrixlab-utils",  label: "Bash",    hint: "Alpine · coreutils",         gradient: "linear-gradient(135deg, #475569, #0f172a)" },
  { id: "matrixlab-build",  label: "Build",   hint: "Multi-runtime · Docker",     gradient: "linear-gradient(135deg, #f59e0b, #dc2626)" },
];

const PROVISIONING_STEPS = [
  { label: "Reserving slot in warm pool", duration: 420 },
  { label: "Mounting workspace (read-only)", duration: 280 },
  { label: "Applying network policy", duration: 200 },
  { label: "Setting environment variables", duration: 180 },
  { label: "Health check", duration: 240 },
];

function SandboxWizard({ onClose, onCreated, defaults }) {
  const [config, setConfig] = useState({ ...defaults });
  const [phase, setPhase] = useState("configure"); // configure | provisioning | ready
  const [stepIdx, setStepIdx] = useState(0);
  const [sbxId, setSbxId] = useState(null);

  const launch = async () => {
    const id = "sbx-" + Math.random().toString(36).slice(2, 9);
    setSbxId(id);
    setPhase("provisioning");
    for (let i = 0; i < PROVISIONING_STEPS.length; i++) {
      setStepIdx(i);
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, PROVISIONING_STEPS[i].duration));
    }
    setStepIdx(PROVISIONING_STEPS.length);
    setPhase("ready");
  };

  const useSandbox = () => {
    onCreated({
      id: sbxId,
      image: config.image,
      status: "ready",
      network: config.network,
      cpu: config.cpu,
      memory: config.memory,
      timeout: config.timeout,
      createdAt: Date.now(),
      ttl: 1800,
      runs: 0,
    });
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 640 }}>
        <div className="modal-head">
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
              {phase === "configure"    && "Create sandbox"}
              {phase === "provisioning" && "Provisioning sandbox…"}
              {phase === "ready"        && "Sandbox is ready"}
            </h3>
            <div style={{ fontSize: 12, color: "var(--ml-text-3)", marginTop: 2 }}>
              {phase === "configure"    && "Pick an image and isolation profile. Defaults are safe — network off, 120s timeout."}
              {phase === "provisioning" && `${sbxId} · should take ~1.3s on a warm pool`}
              {phase === "ready"        && `${sbxId} · ready for execution`}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon name="x"/></button>
        </div>

        {phase === "configure" && (
          <div className="modal-body">
            <div className="field">
              <label>Image</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {SBX_IMAGES.map(img => (
                  <button key={img.id}
                    onClick={() => setConfig({ ...config, image: img.id })}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 12px",
                      border: `1px solid ${config.image === img.id ? "var(--ml-accent)" : "var(--ml-border)"}`,
                      borderRadius: 8,
                      background: config.image === img.id ? "var(--ml-accent-soft)" : "var(--ml-surface)",
                      cursor: "pointer",
                      textAlign: "left",
                    }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 6,
                      background: img.gradient,
                      display: "grid", placeItems: "center",
                      color: "white", fontWeight: 700, fontSize: 10.5,
                    }}>{img.label.slice(0,2).toUpperCase()}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500 }}>{img.label}</div>
                      <div style={{ fontSize: 10.5, color: "var(--ml-text-3)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.hint}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Network</label>
              <div className="segmented">
                <button className={config.network === "off" ? "on" : ""} onClick={() => setConfig({ ...config, network: "off" })}>
                  Off — safest
                </button>
                <button className={config.network === "on" ? "on" : ""} onClick={() => setConfig({ ...config, network: "on" })}>
                  On — allow installs
                </button>
              </div>
            </div>

            <div className="grid-3">
              <div className="field">
                <label>CPU</label>
                <div className="segmented">
                  {[1, 2, 4].map(c => (
                    <button key={c} className={config.cpu === c ? "on" : ""} onClick={() => setConfig({ ...config, cpu: c })}>{c}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Memory</label>
                <div className="segmented">
                  {[512, 1024, 2048].map(m => (
                    <button key={m} className={config.memory === m ? "on" : ""} onClick={() => setConfig({ ...config, memory: m })}>
                      {m < 1024 ? `${m}M` : `${m/1024}G`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Timeout</label>
                <div className="segmented">
                  {[60, 120, 600].map(t => (
                    <button key={t} className={config.timeout === t ? "on" : ""} onClick={() => setConfig({ ...config, timeout: t })}>
                      {t < 60 ? `${t}s` : `${t/60}m`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{
              padding: "10px 12px",
              background: "var(--ml-surface-2)",
              borderRadius: 6,
              fontSize: 12, color: "var(--ml-text-2)",
              display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <Icon name="shield" size={14}/>
              <div>
                Fresh container · workspace read-only · capabilities dropped (SYS_ADMIN, NET_RAW, MKNOD)
                · seccomp profile <span className="mono">matrixlab-default-v3</span>
                · destroyed automatically after 30 min idle.
              </div>
            </div>
          </div>
        )}

        {phase === "provisioning" && (
          <div className="modal-body">
            <div className="terminal" style={{
              background: "#0c1116",
              fontSize: 12.5,
              borderRadius: 6,
              padding: "16px 18px",
            }}>
              {PROVISIONING_STEPS.map((s, i) => {
                const state = i < stepIdx ? "done" : i === stepIdx ? "current" : "todo";
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "5px 0",
                    color: state === "done" ? "#75c785" : state === "current" ? "#c8d2dc" : "#6c7884",
                  }}>
                    <span style={{ width: 14, display: "grid", placeItems: "center" }}>
                      {state === "done" && <Icon name="check" size={12}/>}
                      {state === "current" && <span style={{
                        width: 8, height: 8, borderRadius: "50%", background: "#6ec1c9",
                        animation: "pw-blink 0.8s infinite"
                      }}/>}
                      {state === "todo" && <span style={{
                        width: 8, height: 8, borderRadius: "50%", border: "1px solid #2a323c"
                      }}/>}
                    </span>
                    <span>{s.label}</span>
                    {state === "done" && (
                      <span style={{ marginLeft: "auto", color: "#6c7884", fontSize: 10.5 }}>
                        {(s.duration/1000).toFixed(2)}s
                      </span>
                    )}
                  </div>
                );
              })}
              <style>{`@keyframes pw-blink { 50% { opacity: 0.25; } }`}</style>
            </div>
            <div className="kv" style={{ fontSize: 12.5, gridTemplateColumns: "120px 1fr", gap: "4px 12px" }}>
              <div className="k">Sandbox id</div><div className="v mono">{sbxId}</div>
              <div className="k">Image</div><div className="v mono">{config.image}</div>
              <div className="k">Resources</div><div className="v">{config.cpu} core · {config.memory < 1024 ? `${config.memory}M` : `${config.memory/1024}G`}</div>
              <div className="k">Network</div><div className="v">{config.network === "off" ? "disabled" : "allowlist egress"}</div>
            </div>
          </div>
        )}

        {phase === "ready" && (
          <div className="modal-body">
            <div style={{
              padding: "18px 16px",
              background: "var(--ml-success-soft)",
              border: "1px solid var(--ml-success-soft)",
              borderRadius: 8,
              display: "flex", alignItems: "center", gap: 14,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: "var(--ml-success)", color: "white",
                display: "grid", placeItems: "center",
              }}>
                <Icon name="check" size={20}/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ml-success)" }}>Sandbox ready</div>
                <div style={{ fontSize: 12.5, color: "var(--ml-success)" }}>
                  Provisioned in 1.32s · TTL 30 min · workspace at <span className="mono">/workspace</span>
                </div>
              </div>
            </div>
            <div className="kv" style={{ fontSize: 13, gridTemplateColumns: "140px 1fr", gap: "6px 12px" }}>
              <div className="k">Sandbox id</div><div className="v mono">{sbxId}</div>
              <div className="k">Image</div><div className="v mono">{config.image}</div>
              <div className="k">Network</div><div className="v">{config.network === "off" ? "disabled" : "allowlist egress"}</div>
              <div className="k">CPU / Memory</div><div className="v">{config.cpu} core · {config.memory < 1024 ? `${config.memory}M` : `${config.memory/1024}G`}</div>
              <div className="k">Timeout</div><div className="v">{config.timeout}s</div>
            </div>
            <div style={{ padding: "10px 12px", background: "var(--ml-surface-2)", borderRadius: 6, fontSize: 12.5, color: "var(--ml-text-2)" }}>
              Use this sandbox to run new cells in the Playground. You can spin up another at any time.
            </div>
          </div>
        )}

        <div className="modal-foot">
          {phase === "configure" && <>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={launch}>
              <Icon name="play" size={13}/> Launch sandbox
            </button>
          </>}
          {phase === "provisioning" && <>
            <button className="btn" disabled>Cancel</button>
            <button className="btn btn-primary" disabled>
              <Icon name="refresh" size={13} className="spin"/> Provisioning…
            </button>
          </>}
          {phase === "ready" && <>
            <button className="btn" onClick={onClose}>Close</button>
            <button className="btn btn-primary" onClick={useSandbox}>
              <Icon name="play" size={13}/> Use sandbox
            </button>
          </>}
        </div>
      </div>
    </div>
  );
}

export { Playground, SandboxWizard, SandboxStrip };
