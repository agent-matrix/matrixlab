import React, { useState, useEffect } from "react";
import { Sidebar, Topbar } from "./chrome.jsx";
import { Dashboard } from "./dashboard.jsx";
import { NewRun } from "./new-run.jsx";
import { RunsList, RunDetail } from "./runs.jsx";
import {
  AdminRuntime, AdminPools, AdminImages, AdminSettings,
  Environments, Artifacts, Security,
} from "./admin.jsx";
import { Profiles } from "./profiles.jsx";
import { Integrations } from "./integrations.jsx";
import { ServiceMonitor } from "./service.jsx";
import { Playground } from "./playground.jsx";
import { Icon, seedRuns } from "./shared.jsx";
import {
  useTweaks, TweaksPanel, TweakSection,
  TweakRadio, TweakColor,
} from "./tweaks-panel.jsx";

function crumbsFor(route, run) {
  if (route.startsWith("run/")) return ["Runs", run ? run.id : "Run detail"];
  if (route === "service")      return ["Platform", "Service Monitor"];
  if (route === "new-run")      return ["Run", "New Run"];
  if (route === "playground")   return ["Run", "Sandbox Playground"];
  if (route === "runs")         return ["Results", "Runs"];
  if (route === "artifacts")    return ["Results", "Artifacts"];
  if (route === "environments") return ["Configure", "Environments"];
  if (route === "profiles")     return ["Configure", "Profiles"];
  if (route === "integrations") return ["Configure", "Integrations"];
  if (route === "security")     return ["Security", "Policies"];
  if (route === "admin-runtime")  return ["Admin", "Runtime Health"];
  if (route === "admin-pools")    return ["Admin", "Warm Pools"];
  if (route === "admin-images")   return ["Admin", "Images"];
  if (route === "admin-settings") return ["Admin", "Settings"];
  return ["Dashboard"];
}

const DEFAULT_TWEAKS = /*EDITMODE-BEGIN*/{
  "accent": "#0f7a73",
  "density": "comfortable",
  "logTheme": "dark"
}/*EDITMODE-END*/;

export default function ConsoleApp() {
  const [route, setRoute] = useState("dashboard");
  const [runs, setRuns] = useState(seedRuns);
  const [adminMode, setAdminMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // simulate "running" run progressing to passed after a few seconds for liveness
  useEffect(() => {
    const t = setTimeout(() => {
      setRuns(rs => rs.map(r => r.status === "running"
        ? { ...r, status: "passed", duration: 16.8, exit: 0, artifacts: 3, output: "117 passed in 14.7s" }
        : r));
    }, 14000);
    return () => clearTimeout(t);
  }, []);

  // tweaks
  const [t, setTweak] = useTweaks(DEFAULT_TWEAKS);
  useEffect(() => {
    document.documentElement.style.setProperty("--ml-accent", t.accent);
    // derive a soft variant
    const soft = mixWithWhite(t.accent, 0.88);
    document.documentElement.style.setProperty("--ml-accent-soft", soft);
    const hover = mixWithBlack(t.accent, 0.12);
    document.documentElement.style.setProperty("--ml-accent-hover", hover);
  }, [t.accent]);
  useEffect(() => {
    const px = t.density === "compact" ? 13 : t.density === "spacious" ? 14.5 : 14;
    document.body.style.fontSize = `${px}px`;
  }, [t.density]);

  const navigate = (r) => setRoute(r);

  let activeRun = null;
  if (route.startsWith("run/")) {
    const id = route.slice(4);
    activeRun = runs.find(r => r.id === id);
  }

  // selected run for sidebar highlight
  const sideRoute =
    route.startsWith("run/") ? "runs" :
    route === "service" ? "service" :
    route === "new-run" ? "new-run" :
    route === "playground" ? "playground" :
    route === "runs" ? "runs" :
    route === "artifacts" ? "artifacts" :
    route === "environments" ? "environments" :
    route === "profiles" ? "profiles" :
    route === "integrations" ? "integrations" :
    route === "security" ? "security" :
    route.startsWith("admin-") ? route :
    "dashboard";

  return (
    <div className="app">
      <Sidebar route={sideRoute} navigate={navigate} runsCount={runs.length} adminMode={adminMode}
        onSettings={() => setShowSettings(true)}/>
      <div className="main">
        <Topbar
          crumbs={crumbsFor(route, activeRun)}
          onSettings={() => setShowSettings(true)}
          onToggleAdmin={() => setAdminMode(v => !v)}
          adminMode={adminMode}
          runtimeOk={true}
        />

        {route === "dashboard" && <Dashboard runs={runs} navigate={navigate}
          onQuickAction={(id) => {
            if (id === "code") navigate("playground");
            else if (id === "env") navigate("environments");
            else navigate("new-run");
          }}/>}

        {route === "service" && <ServiceMonitor/>}

        {route === "new-run" && <NewRun
          onCancel={() => navigate("dashboard")}
          onLaunch={(spec) => {
            const id = "sbx-" + Math.random().toString(36).slice(2, 9);
            const newRun = {
              id, status: "running", source: spec.source,
              repo: spec.source === "repo" ? spec.repo.url.replace(/^https?:\/\//, "") : null,
              branch: spec.source === "repo" ? spec.repo.branch : null,
              command: spec.source === "code" ? `${spec.code.language} main` :
                       spec.source === "repo" ? spec.repo.command :
                       spec.source === "workspace" ? spec.workspace.command : "pytest -q",
              profile: spec.source === "repo" ? spec.repo.profile : "Python Test",
              duration: null, exit: null,
              image: `matrixlab-${spec.runtime.language.toLowerCase().replace(".js","").replace(" (custom)","")}`,
              network: spec.runtime.network,
              started: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              startedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
              user: "ana.silva", artifacts: 0, output: ""
            };
            setRuns(rs => [newRun, ...rs]);
            // simulate completion after a few seconds
            setTimeout(() => {
              setRuns(rs => rs.map(r => r.id === id
                ? { ...r, status: "passed", duration: 6.2, exit: 0, artifacts: 1, output: "OK" }
                : r));
            }, 6000);
            navigate(`run/${id}`);
          }}/>}

        {route === "playground" && <Playground/>}
        {route === "runs"      && <RunsList runs={runs} navigate={navigate}/>}
        {route.startsWith("run/") && <RunDetail run={activeRun} navigate={navigate}/>}

        {route === "artifacts"    && <Artifacts runs={runs} navigate={navigate}/>}
        {route === "environments" && <Environments navigate={navigate}/>}
        {route === "profiles"     && <Profiles/>}
        {route === "integrations" && <Integrations navigate={navigate}/>}
        {route === "security"     && <Security/>}

        {route === "admin-runtime"  && <AdminRuntime/>}
        {route === "admin-pools"    && <AdminPools/>}
        {route === "admin-images"   && <AdminImages/>}
        {route === "admin-settings" && <AdminSettings/>}
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)}/>}

      <TweaksPanel title="Tweaks">
        <TweakSection title="Brand accent">
          <TweakColor t={t} setTweak={setTweak} k="accent"
            options={["#0f7a73", "#2563eb", "#7c3aed", "#0ea5e9", "#dc2626"]}/>
        </TweakSection>
        <TweakSection title="Density">
          <TweakRadio t={t} setTweak={setTweak} k="density"
            options={["compact", "comfortable", "spacious"]}/>
        </TweakSection>
        <TweakSection title="Log panel theme">
          <TweakRadio t={t} setTweak={setTweak} k="logTheme"
            options={["dark", "light"]}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

function SettingsModal({ onClose }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Connection settings</h3>
          <button className="icon-btn" onClick={onClose}><Icon name="x"/></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Runner URL</label>
            <input className="input" defaultValue="http://localhost:8000"/>
          </div>
          <div className="field">
            <label>Bearer token</label>
            <input className="input" type="password" defaultValue="••••••••••••••••"/>
          </div>
          <div className="field">
            <label>Polling interval</label>
            <div className="segmented">
              {[2, 5, 10, 30].map(s => <button key={s} className={s === 5 ? "on" : ""}>{s}s</button>)}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={onClose}>Save</button>
        </div>
      </div>
    </div>
  );
}

// utility: blend hex toward white/black
function mixWithWhite(hex, amt) { return mix(hex, "#ffffff", amt); }
function mixWithBlack(hex, amt) { return mix(hex, "#000000", amt); }
function mix(a, b, amt) {
  const ax = parseInt(a.slice(1), 16);
  const bx = parseInt(b.slice(1), 16);
  const ar = (ax >> 16) & 255, ag = (ax >> 8) & 255, ab = ax & 255;
  const br = (bx >> 16) & 255, bg = (bx >> 8) & 255, bb = bx & 255;
  const r = Math.round(ar + (br - ar) * amt);
  const g = Math.round(ag + (bg - ag) * amt);
  const bl = Math.round(ab + (bb - ab) * amt);
  return "#" + [r, g, bl].map(v => v.toString(16).padStart(2, "0")).join("");
}
