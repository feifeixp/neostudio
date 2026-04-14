"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Session {
  nickname?: string;
  contact?: string;
  email?: string;
  authorization?: string;
}

const LANDING_URL = "https://neowow.studio";

/** Deterministic hue from a string (for consistent avatar color) */
function nameToHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) % 360;
}

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem("neoStudioSession");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export default function UserMenu() {
  const [session, setSession] = useState<Session | null>(null);
  const [open,    setOpen]    = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = () => setSession(readSession());

  // Read on mount
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-read when page.tsx fires the custom event (cross-origin token handoff)
  useEffect(() => {
    window.addEventListener("neoSessionUpdated", refresh);
    return () => window.removeEventListener("neoSessionUpdated", refresh);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const displayName  = session?.nickname || session?.contact || "";
  const displayEmail = session?.email    || session?.contact || "";
  const initials     = displayName
    ? displayName.slice(0, 2).toUpperCase()
    : "?";

  // Consistent color per user name
  const hue       = displayName ? nameToHue(displayName) : 240;
  const avatarBg  = displayName
    ? `hsl(${hue},65%,42%)`
    : "rgba(255,255,255,0.12)";

  const handleLogout = () => {
    try { localStorage.removeItem("neoStudioSession"); } catch { /* ignore */ }
    setSession(null);
    setOpen(false);
    // Redirect to landing page with ?logout=1 so it clears its own session too
    window.location.href = `${LANDING_URL}?logout=1`;
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Avatar button */}
      <button
        className="avatar"
        onClick={() => setOpen(o => !o)}
        title={displayName || "点击登录"}
        style={{
          cursor:          "pointer",
          border:          open ? "2px solid rgba(99,102,241,0.7)" : "2px solid transparent",
          transition:      "border-color 0.15s",
          background:      avatarBg,
          color:           "#fff",
          fontWeight:      700,
          fontSize:        displayName ? "0.78rem" : "1rem",
          userSelect:      "none",
        }}
      >
        {initials}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="user-dropdown">
          {displayName ? (
            <>
              <div className="user-dropdown-header">
                <div className="user-dropdown-avatar" style={{ background: avatarBg }}>
                  {initials}
                </div>
                <div>
                  <div className="user-dropdown-name">{displayName}</div>
                  {displayEmail && displayEmail !== displayName && (
                    <div className="user-dropdown-email">{displayEmail}</div>
                  )}
                </div>
              </div>
              <div className="user-dropdown-divider" />
              <Link href="/account" className="user-dropdown-item" onClick={() => setOpen(false)} style={{ display: 'block', textDecoration: 'none' }}>账户中心</Link>
              <Link href="/logs" className="user-dropdown-item" onClick={() => setOpen(false)} style={{ display: 'block', textDecoration: 'none' }}>监控日志</Link>
              <button className="user-dropdown-item" onClick={handleLogout}>
                退出账号
              </button>
            </>
          ) : (
            <div style={{ padding: "16px", fontSize: "0.85rem", color: "var(--text-secondary)", textAlign: "center" }}>
              <div style={{ marginBottom: 12 }}>尚未登录</div>
              <a
                href={LANDING_URL}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#a5b4fc", textDecoration: "none", fontWeight: 600 }}
              >
                前往登录 →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
