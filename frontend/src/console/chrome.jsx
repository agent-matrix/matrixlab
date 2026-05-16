import React, { useState, useEffect } from "react";
import { Icon } from "./shared.jsx";

// ----- Sidebar -----
function Sidebar({ route, navigate, runsCount, adminMode, onSettings }) {
  const Item = ({ id, label, icon, badge, group }) => (
    <button
      className={`nav-item ${route.startsWith(id) ? "active" : ""}`}
      onClick={() => navigate(id)}
    >
      <Icon name={icon}/>
      <span>{label}</span>
      {badge != null && <span className="nav-badge">{badge}</span>}
    </button>
  );
  const [menuOpen, setMenuOpen] = useState(false);
  // close on outside click / Esc
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => {
      if (!e.target.closest(".user-menu") && !e.target.closest(".user-trigger")) {
        setMenuOpen(false);
      }
    };
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark" aria-hidden>M</div>
        <div>
          <div className="brand-name">MatrixLab</div>
          <div className="brand-sub">Enterprise Console</div>
        </div>
      </div>
      <nav className="nav">
        <div className="nav-section">Platform</div>
        <Item id="service" label="Service Monitor" icon="activity"/>

        <div className="nav-section">Run</div>
        <Item id="dashboard" label="Dashboard" icon="home"/>
        <Item id="new-run" label="New Run" icon="play"/>
        <Item id="playground" label="Playground" icon="terminal"/>

        <div className="nav-section">Results</div>
        <Item id="runs" label="Runs" icon="list" badge={runsCount}/>
        <Item id="artifacts" label="Artifacts" icon="file"/>

        <div className="nav-section">Configure</div>
        <Item id="environments" label="Environments" icon="box"/>
        <Item id="profiles" label="Profiles" icon="layers"/>
        <Item id="integrations" label="Integrations" icon="zap"/>
        <Item id="security" label="Security" icon="shield"/>

        {adminMode && <>
          <div className="nav-section">Admin</div>
          <Item id="admin-runtime" label="Runtime Health" icon="activity"/>
          <Item id="admin-pools" label="Warm Pools" icon="cpu"/>
          <Item id="admin-images" label="Images" icon="db"/>
          <Item id="admin-settings" label="Settings" icon="cog"/>
        </>}
      </nav>
      <div className="sidebar-foot" style={{ position: "relative" }}>
        <button
          className="user-trigger"
          onClick={() => setMenuOpen(v => !v)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <div className="avatar" style={{ background: "linear-gradient(135deg, #4f46e5, #0ea5e9)" }}>RM</div>
          <div style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
            <div className="user-name">Ruslan M.</div>
            <div className="user-role" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                admin@selfrepair.dev
              </span>
            </div>
          </div>
          <Icon name="chevD" size={14} className={`um-chev ${menuOpen ? "open" : ""}`}/>
        </button>

        {menuOpen && (
          <UserMenu
            close={() => setMenuOpen(false)}
            onSettings={() => { setMenuOpen(false); onSettings && onSettings(); }}
          />
        )}
      </div>
    </aside>
  );
}

function UserMenu({ close, onSettings }) {
  const Item = ({ icon, label, sub, shortcut, danger, onClick }) => (
    <button className={`um-item ${danger ? "danger" : ""}`} onClick={() => { onClick && onClick(); }}>
      <Icon name={icon} size={15}/>
      <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
      {shortcut && <span className="um-shortcut">{shortcut}</span>}
    </button>
  );
  return (
    <div className="user-menu" role="menu">
      <div className="um-header">
        <div className="avatar" style={{ width: 36, height: 36, fontSize: 13,
          background: "linear-gradient(135deg, #4f46e5, #0ea5e9)" }}>RM</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Ruslan M.</div>
          <div style={{ fontSize: 11.5, color: "var(--ml-text-3)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            admin@selfrepair.dev
          </div>
        </div>
        <span className="pill info" style={{ flexShrink: 0 }}><span className="dot"/>admin</span>
      </div>
      <div className="um-divider"/>
      <div className="um-group">
        <Item icon="info"     label="About"/>
        <Item icon="cog"      label="Settings"  shortcut="⌘ ," onClick={onSettings}/>
        <Item icon="file"     label="Help & docs"/>
      </div>
      <div className="um-divider"/>
      <div className="um-group">
        <Item icon="x" label="Log out" danger/>
      </div>
      <div className="um-foot">
        <span>MatrixLab</span>
        <span className="mono" style={{ color: "var(--ml-text-3)" }}>v0.4.2</span>
        <span className="pill success" style={{ marginLeft: "auto" }}>
          <span className="dot"/>connected
        </span>
      </div>
    </div>
  );
}

// ----- Topbar -----
function Topbar({ crumbs, onSettings, onToggleAdmin, adminMode, runtimeOk }) {
  return (
    <div className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep">/</span>}
            <span className={i === crumbs.length - 1 ? "here" : ""}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="topbar-right">
        <div className="runtime-chip" title="Runner health">
          <span className="dot" style={{ background: runtimeOk ? "var(--ml-success)" : "var(--ml-danger)",
            boxShadow: `0 0 0 3px ${runtimeOk ? "var(--ml-success-soft)" : "var(--ml-danger-soft)"}` }}/>
          Runner · {runtimeOk ? "Healthy" : "Unhealthy"}
        </div>
        <button className="btn btn-sm" onClick={onToggleAdmin}>
          {adminMode ? "Exit admin" : "Admin mode"}
        </button>
        <button className="icon-btn" title="Notifications"><Icon name="bell"/></button>
        <button className="icon-btn" title="Settings" onClick={onSettings}><Icon name="cog"/></button>
      </div>
    </div>
  );
}

export { Sidebar, Topbar };
