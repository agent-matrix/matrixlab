/* ============================================================
   data.jsx — catalog data + CLI response engine
   Exports to window.
   ============================================================ */

const TOOLS = [
  { id: "retell-ai", initials: "RA", name: "Retell AI", type: "Voice Agent",
    description: "Deploy real-time conversational AI agents for calls, support, and workflow automation.",
    installs: "1.6K", rating: "3.5", updated: "2 days ago", verified: true, kind: "Tool",
    tags: ["voice", "agent", "support", "calls", "automation"] },
  { id: "openai-image", initials: "OA", name: "OpenAI Image", type: "Creative AI",
    description: "Generate, edit, and transform product visuals directly inside agent workflows.",
    installs: "8.9K", rating: "4.8", updated: "Today", verified: true, kind: "Tool",
    tags: ["image", "creative", "generation", "workflow", "visuals"] },
  { id: "microsoft-office", initials: "MS", name: "Microsoft Office", type: "Productivity",
    description: "Connect docs, spreadsheets, email, and team knowledge to AI-powered automations.",
    installs: "12K", rating: "4.6", updated: "1 week ago", verified: true, kind: "MCP Server",
    tags: ["docs", "spreadsheets", "email", "team", "productivity"] },
  { id: "talentlms", initials: "TL", name: "TalentLMS", type: "Learning Ops",
    description: "Automate employee onboarding, learning paths, compliance checks, and reporting.",
    installs: "940", rating: "4.2", updated: "4 days ago", verified: false, kind: "Agent",
    tags: ["learning", "onboarding", "compliance", "training", "ops"] },
];

const SEARCH_RESULTS = [
  { initials: "GW", name: "Github Webhook MCP", kind: "Tool", installs: "1.8K", rating: "3.5",
    status: "Recently updated", verified: false, version: "1.4.0",
    description: "Trigger agents, sync commits, and route webhook events through MCP workflows." },
  { initials: "GI", name: "GitHub Inside Claude Code", kind: "Tool", installs: "1.3K", rating: "3.5",
    status: "Recently updated", verified: false, version: "0.9.1",
    description: "Repository context, pull request review, and coding actions from an agent workspace." },
  { initials: "GS", name: "GitHub Semantic Search", kind: "MCP Server", installs: "3K", rating: "4.1",
    status: "Recently updated", verified: true, version: "2.0.3",
    description: "Ask questions across issues, code, discussions, and repository history." },
  { initials: "GA", name: "GitHub Actions Agent", kind: "Agent", installs: "2.7K", rating: "4.4",
    status: "Verified build", verified: true, version: "1.1.0",
    description: "Debug CI failures, suggest workflow patches, and open remediation pull requests." },
  { initials: "GP", name: "GitHub Pull Request Copilot", kind: "Agent", installs: "2.2K", rating: "4.3",
    status: "Verified build", verified: true, version: "3.2.1",
    description: "Summarize, test, and prepare pull requests for high-signal review." },
  { initials: "GV", name: "GitHub Vulnerability Watch", kind: "Tool", installs: "1.5K", rating: "4.2",
    status: "Verified build", verified: true, version: "0.7.4",
    description: "Scan repo advisories and dependency activity before risky releases ship." },
  { initials: "GD", name: "GitHub Docs Publisher", kind: "MCP Server", installs: "980", rating: "3.9",
    status: "Recently updated", verified: false, version: "1.0.0",
    description: "Publish repository docs into internal knowledge bases and public sites." },
  { initials: "GR", name: "GitHub Release Orchestrator", kind: "Agent", installs: "1.1K", rating: "4.0",
    status: "Verified build", verified: true, version: "2.3.0",
    description: "Cut releases, generate changelogs, and coordinate multi-repo deploy gates." },
];

const CATEGORIES = [
  { icon: "Database", label: "Data", text: "Databases, warehouses, vectors" },
  { icon: "Code", label: "Developer Tools", text: "Git, CI, code intelligence" },
  { icon: "Message", label: "Communication", text: "Slack, email, voice, support" },
  { icon: "FileText", label: "Files", text: "Docs, drives, parsing, OCR" },
  { icon: "Brain", label: "AI & RAG", text: "Embeddings, retrieval, memory" },
  { icon: "Globe", label: "Web & Browsing", text: "Browsing, search, extraction" },
];

const RETELL_FEATURES = [
  { title: "Voice agent operations", icon: "Radio",
    text: "Create, test, and manage phone-call agents from one focused interface." },
  { title: "LLM + voice discovery", icon: "Layers",
    text: "Inspect voices, model layers, latency posture, and handoff readiness." },
  { title: "Secure install path", icon: "Shield",
    text: "Copy commands or launch the Matrix Protocol Helper with clear feedback." },
];

const INSTALL_COMMAND =
  "matrix install tool.io-github-mindstone-mcp-server-retell-ai.5425b3de29@0.2.2 --alias retell-ai";

function scoreTool(tool, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return 100 + (tool.verified ? 10 : 0) + Number(tool.rating);
  const tokens = normalized.split(" ").filter(Boolean);
  const haystack = `${tool.name} ${tool.type} ${tool.description} ${tool.tags.join(" ")}`.toLowerCase();
  return (
    tokens.reduce((score, token) => {
      if (tool.name.toLowerCase().includes(token)) return score + 30;
      if (tool.type.toLowerCase().includes(token)) return score + 20;
      if (tool.tags.some((tag) => tag.includes(token))) return score + 15;
      if (haystack.includes(token)) return score + 8;
      return score;
    }, 0) + (tool.verified ? 10 : 0) + Number(tool.rating)
  );
}

/* ---- Lightweight session state (mirrors real CLI; easy to wire to a sandbox) ---- */
const SESSION = { runners: {} }; // alias -> {name, alias, version, port, url, pid, running}
const HUB_BASE = "https://api.matrixhub.io";
function kindSlug(kind) { return (kind || "tool").toLowerCase().replace(/\s+/g, "_"); }
function rnd(min, max) { return Math.floor(min + Math.random() * (max - min)); }

function parseCmd(raw) {
  let toks = (raw.trim().replace(/^\//, "").match(/"[^"]*"|'[^']*'|\S+/g) || [])
    .map((t) => t.replace(/^["']|["']$/g, ""));
  if (toks[0] === "matrix") toks.shift();
  const flags = {}, pos = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.startsWith("--")) {
      const k = t.slice(2), next = toks[i + 1];
      if (next && !next.startsWith("-")) { flags[k] = next; i++; } else flags[k] = true;
    } else if (t.startsWith("-")) { flags[t.slice(1)] = true; }
    else pos.push(t);
  }
  return { cmd: (pos[0] || "").toLowerCase(), pos, flags };
}

function chatReply(q) {
  const lower = q.toLowerCase();
  const ranked = TOOLS.map((t) => ({ ...t, score: scoreTool(t, q) })).sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const lines = ["matrix · assistant"];
  if (/(hi|hello|hey|yo)\b/.test(lower) && q.length < 16) {
    lines.push("Hey — I'm your guide to the MatrixHub catalog. Ask about agents, tools, or MCP servers,");
    lines.push("or describe what you want to build and I'll point you to the right systems + commands.");
  } else if (/voice|call|phone|support/.test(lower)) {
    lines.push("For voice agents, Retell AI is the verified pick — real-time phone calls and support flows.");
    lines.push("  matrix search voice --type tool   ·   matrix install retell-ai");
  } else if (/image|visual|picture|photo|design/.test(lower)) {
    lines.push("OpenAI Image generates and edits visuals right inside agent workflows.");
    lines.push("  matrix search image   ·   matrix install openai-image");
  } else if (/doc|office|spreadsheet|email|excel|word/.test(lower)) {
    lines.push("Microsoft Office connects docs, sheets, and email into your automations.");
    lines.push("  matrix search office --type mcp_server   ·   matrix install microsoft-office");
  } else if (/install|deploy|set ?up|run|start/.test(lower)) {
    lines.push("The core loop is discover → install → run:");
    lines.push("  matrix search \"" + q.split(" ").slice(0, 3).join(" ") + "\"");
    lines.push("  matrix install <name> --alias <a>   ·   matrix run <a>");
  } else if (/mcp|protocol|server|sse/.test(lower)) {
    lines.push("MCP servers expose tools over SSE. MatrixHub is the registry — the pip of agents & MCP servers.");
    lines.push("  matrix search <topic> --type mcp_server   ·   matrix mcp probe --alias <a>");
  } else if (/what|how|explain|who|why|matrix|hub|use|do you/.test(lower)) {
    lines.push("MatrixHub is a marketplace for AI agents, tools, and MCP servers — discover, install,");
    lines.push("and run them in seconds. Tell me your goal, or run: matrix search <topic>.");
  } else if (top && top.score > 12) {
    lines.push("Closest match in the catalog: " + top.name + " — " + top.description);
    lines.push("  matrix install " + top.id + " --alias " + top.id + "   ·   matrix show " + top.id);
  } else {
    lines.push("I can help you discover and run AI infrastructure. Describe the goal, or search the catalog:");
    lines.push("  matrix search \"" + q.slice(0, 32) + "\"");
  }
  lines.push("(plain text chats with the Matrix · type matrix help for commands)");
  return { tone: "ok", lines };
}

function responseFor(raw) {
  const input = raw.trim();
  if (!input) return null;
  const p = parseCmd(input);
  const cmd = p.cmd;

  if (["help", "--help", "-h", "?"].includes(cmd) || input === "/help") {
    return { tone: "sys", lines: [
      "MATRIX CLI — essential commands",
      "  matrix search <query> [--type agent|tool|mcp_server]   discover the catalog",
      "  matrix install <name> [--alias <a>]                    materialize a runner",
      "  matrix run <alias> [--port <n>]                        start it · prints URL",
      "  matrix do <alias> \"<prompt>\"                           talk to a running agent",
      "  matrix mcp probe --alias <a>                           list exposed tools",
      "  matrix mcp call <tool> --alias <a> --args '{…}'        call a tool",
      "  matrix mcp test <name> [--cmd \"<start>\"]               trial in a hosted sandbox",
      "  matrix ps                                              running runners + URLs",
      "  matrix logs <alias> [-f]   ·   matrix stop <alias>",
      "  matrix connection [--json]                             hub health",
      "  matrix uninstall <alias> [-y] [--purge]   ·   matrix version   ·   clear",
      "  …or just type a question — chat with the Matrix in plain English.",
    ] };
  }

  if (cmd === "game" || cmd === "play") {
    return { tone: "ok", action: "game", lines: [
      "decrypting hidden module … white_rabbit.sys",
      "access granted — follow the white rabbit ↴",
    ] };
  }

  if (cmd === "version" || p.flags.version) {
    return { tone: "ok", lines: [
      "matrix-cli 0.1.6",
      "matrix-python-sdk 0.1.9 · python 3.11+",
      `hub ${HUB_BASE}`,
    ] };
  }

  if (cmd === "search") {
    const type = typeof p.flags.type === "string" ? p.flags.type.toLowerCase() : null;
    const limit = p.flags.limit ? Number(p.flags.limit) : 8;
    const query = p.pos.slice(1).join(" ");
    let list = TOOLS.map((t) => ({ ...t, score: scoreTool(t, query) }))
      .filter((t) => !query || t.score > 8);
    if (type) list = list.filter((t) => kindSlug(t.kind) === type);
    list = list.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
    if (!list.length) return { tone: "warn", lines: [`no results for "${query}"${type ? " --type " + type : ""}`, "try a broader query, e.g. matrix search github"] };
    return { tone: "ok", lines: [
      `${list.length} result${list.length === 1 ? "" : "s"}${type ? " · type=" + type : ""}`,
      ...list.map((t) => {
        const id = `${kindSlug(t.kind)}:${t.id}@0.1.0`;
        return `  ${(t.verified ? "✓" : "·")} ${id.padEnd(40, " ").slice(0, 40)} ${t.installs.padStart(5)} installs  ★${t.rating}`;
      }),
      "install: matrix install <name> --alias <a>",
    ] };
  }

  if (cmd === "install") {
    const name = p.pos[1] || "hello-sse-server";
    const slug = name.toLowerCase().replace(/^.*:/, "").replace(/@.*$/, "");
    const alias = typeof p.flags.alias === "string" ? p.flags.alias : slug;
    SESSION.runners[alias] = { name: slug, alias, version: "0.1.0", running: false, port: null };
    return { tone: "ok", lines: [
      `resolving ${name} → mcp_server:${slug}@0.1.0`,
      `materializing runner → ~/.matrix/runners/${alias}/0.1.0`,
      "preparing environment · venv · pip · requirements.txt",
      `✓ installed ${alias}  (mcp_server:${slug}@0.1.0)`,
      `next: matrix run ${alias}`,
    ] };
  }

  if (cmd === "run") {
    const alias = p.pos[1];
    if (!alias) return { tone: "err", lines: ["usage: matrix run <alias> [--port <n>]"] };
    const r = SESSION.runners[alias] || (SESSION.runners[alias] = { name: alias, alias, version: "0.1.0" });
    r.port = p.flags.port ? Number(p.flags.port) : rnd(52000, 53000);
    r.pid = rnd(1000, 9999); r.running = true;
    r.url = `http://127.0.0.1:${r.port}/sse`;
    return { tone: "ok", lines: [
      `starting ${alias} …`,
      `✓ URL:    ${r.url}`,
      `  Health: http://127.0.0.1:${r.port}/health`,
      `  logs:   matrix logs ${alias} -f`,
      `interact: matrix do ${alias} "your question"`,
    ] };
  }

  if (cmd === "do") {
    const alias = p.pos[1];
    const prompt = p.pos.slice(2).join(" ");
    if (!alias || !prompt) return { tone: "err", lines: ['usage: matrix do <alias> "<prompt>"'] };
    const r = SESSION.runners[alias];
    if (!r || !r.running) return { tone: "warn", lines: [`${alias} is not running.`, `start it first: matrix run ${alias}`] };
    return { tone: "ok", lines: [
      `[${alias}] ← "${prompt}"`,
      `[${alias}] thinking …`,
      `[${alias}] → Grounded in the MatrixHub catalog, here's a concise take:`,
      `           ${prompt.replace(/[?.!]+$/, "")} maps to a verified MCP workflow —`,
      `           discover → install → run, then call tools over SSE.`,
      "(connect a sandbox to stream real model output)",
    ] };
  }

  if (cmd === "sandbox" || (cmd === "mcp" && (p.pos[1] || "").toLowerCase() === "test")) {
    // Trial an MCP server in the hosted MatrixLab sandbox. The console
    // turns this marker into a REAL /mcp/* session when sandbox mode is on.
    const entity = cmd === "sandbox" ? p.pos[1] : p.pos[2];
    const startCmd = typeof p.flags.cmd === "string" ? p.flags.cmd : null;
    return {
      tone: "matrix",
      action: "sandbox",
      entity: entity || null,
      start_command: startCmd,
      lines: [`requesting hosted sandbox for ${entity || "the reference MCP server"} …`],
    };
  }

  if (cmd === "mcp") {
    const sub = (p.pos[1] || "").toLowerCase();
    const alias = typeof p.flags.alias === "string" ? p.flags.alias : null;
    const url = typeof p.flags.url === "string" ? p.flags.url : null;
    const target = url || (alias ? `alias ${alias}` : null);
    if (sub === "probe") {
      if (!target) return { tone: "err", lines: ["usage: matrix mcp probe --alias <a>  |  --url <sse-url>"] };
      return { tone: "ok", lines: [
        `probing ${target} …`,
        "tools (4):",
        "  chat        converse with the agent",
        "  search      query the MatrixHub catalog",
        "  summarize   condense documents or threads",
        "  health      liveness probe",
        "call one: matrix mcp call <tool> --alias <a> --args '{…}'",
      ] };
    }
    if (sub === "call") {
      const tool = p.pos[2];
      if (!tool) return { tone: "err", lines: ["usage: matrix mcp call <tool> --alias <a> --args '{…}'"] };
      const args = typeof p.flags.args === "string" ? p.flags.args : "{}";
      return { tone: "ok", lines: [
        `calling ${tool}(${args}) …`,
        `{ "ok": true, "tool": "${tool}", "latency_ms": ${rnd(8, 60)},`,
        `  "result": "executed against ${alias || "remote"} over SSE" }`,
      ] };
    }
    return { tone: "err", lines: ["matrix mcp <probe|call> …  — see matrix help"] };
  }

  if (cmd === "ps") {
    const running = Object.values(SESSION.runners).filter((r) => r.running);
    if (!running.length) return { tone: "dim", lines: ["no running runners.", "try: matrix install hello-sse-server && matrix run hello-sse-server"] };
    return { tone: "ok", lines: [
      "ALIAS              PID    PORT   URL",
      ...running.map((r) =>
        `${r.alias.padEnd(18).slice(0, 18)} ${String(r.pid).padEnd(6)} ${String(r.port).padEnd(6)} http://127.0.0.1:${r.port}/sse`),
    ] };
  }

  if (cmd === "logs") {
    const alias = p.pos[1];
    if (!alias) return { tone: "err", lines: ["usage: matrix logs <alias> [-f]"] };
    const follow = p.flags.f || p.flags.follow;
    return { tone: "sys", lines: [
      `[INF] ${alias} · runner booted`,
      `[INF] ${alias} · listening on /sse`,
      `[INF] ${alias} · tool call chat (${rnd(8, 40)}ms)`,
      `[INF] ${alias} · health ok`,
      ...(follow ? ["… following — Ctrl-C to stop"] : []),
    ] };
  }

  if (cmd === "stop") {
    const alias = p.pos[1];
    if (!alias) return { tone: "err", lines: ["usage: matrix stop <alias>"] };
    const r = SESSION.runners[alias];
    if (!r) return { tone: "warn", lines: [`unknown alias: ${alias} — see matrix ps`] };
    r.running = false;
    return { tone: "ok", lines: [`✓ stopped ${alias}`] };
  }

  if (cmd === "uninstall") {
    const alias = p.pos[1];
    if (!alias && !p.flags.all) return { tone: "err", lines: ["usage: matrix uninstall <alias> [-y] [--purge]"] };
    if (p.flags.all) { SESSION.runners = {}; return { tone: "ok", lines: ["✓ removed all aliases from the local store"] }; }
    if (!SESSION.runners[alias]) return { tone: "warn", lines: [`unknown alias: ${alias}`] };
    delete SESSION.runners[alias];
    return { tone: "ok", lines: [`✓ uninstalled ${alias}${p.flags.purge ? " (files purged · safe path)" : ""}`] };
  }

  if (cmd === "connection" || cmd === "ping") {
    const ms = rnd(18, 60);
    if (p.flags.json) return { tone: "ok", lines: ["{", `  "hub": "${HUB_BASE}",`, '  "ok": true,', '  "status": 200,', `  "latency_ms": ${ms}`, "}"] };
    return { tone: "ok", lines: [
      `hub     ${HUB_BASE}`,
      `status  online · 200 OK · ${ms}ms`,
      "catalog 2,481 systems indexed",
    ] };
  }

  if (cmd === "show") {
    const id = p.pos[1] || "mcp_server:retell-ai@0.1.0";
    const t = TOOLS.find((x) => id.includes(x.id)) || TOOLS[0];
    return { tone: "sys", lines: [
      `id          ${kindSlug(t.kind)}:${t.id}@0.1.0`,
      `name        ${t.name}`,
      `type        ${t.kind}`,
      `installs    ${t.installs} · rating ★${t.rating}`,
      `verified    ${t.verified ? "yes" : "no"}`,
      `summary     ${t.description}`,
    ] };
  }

  if (cmd === "doctor") {
    const alias = p.pos[1] || "—";
    return { tone: "ok", lines: [
      `diagnostics for ${alias}`,
      "  python 3.11+        ✓",
      "  matrix-python-sdk   ✓ 0.1.9",
      "  mcp extra           ✓ 1.13.1",
      "  hub reachable       ✓",
      "  target writable     ✓",
    ] };
  }

  const isCmdAttempt = /^\s*(matrix\b|\/)/i.test(input);
  if (isCmdAttempt) {
    return { tone: "warn", lines: [
      `unknown command: ${p.cmd || input}`,
      "type matrix help for the command reference,",
      "or just ask in plain English — e.g. “which server is best for voice?”",
    ] };
  }
  return chatReply(input);
}

Object.assign(window, {
  TOOLS, SEARCH_RESULTS, CATEGORIES, RETELL_FEATURES, INSTALL_COMMAND,
  scoreTool, responseFor,
});
