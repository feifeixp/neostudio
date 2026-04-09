"use client";
import { useEffect, useRef, useState } from "react";

interface Session {
  nickname?: string;
  contact?: string;
  email?: string;
  authorization?: string;
}

export default function UserMenu() {
  const [session, setSession]   = useState<Session | null>(null);
  const [open,    setOpen]      = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Read session from localStorage (set by the landing page auth flow)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("neoStudioSession");
      if (raw) setSession(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initials = session?.nickname
    ? session.nickname.slice(0, 2).toUpperCase()
    : session?.contact
    ? session.contact.slice(0, 2).toUpperCase()
    : "?";

  const displayName  = session?.nickname  || session?.contact || "未登录";
  const displayEmail = session?.email     || session?.contact || "";

  const handleLogout = () => {
    try { localStorage.removeItem("neoStudioSession"); } catch { /* ignore */ }
    setSession(null);
    setOpen(false);
    window.location.reload();
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Avatar button */}
      <button
        className="avatar"
        onClick={() => setOpen(o => !o)}
        title={displayName}
        style={{
          cursor: "pointer",
          border: open ? "2px solid rgba(99,102,241,0.7)" : "2px solid transparent",
          transition: "border-color 0.15s",
          background: session ? "linear-gradient(135deg,#6366f1,#4f46e5)" : "var(--glass-border)",
          color: "#fff",
          fontWeight: 600,
        }}
      >
        {initials}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="user-dropdown">
          {/* Account info */}
          <div className="user-dropdown-header">
            <div className="user-dropdown-avatar">{initials}</div>
            <div>
              <div className="user-dropdown-name">{displayName}</div>
              {displayEmail && displayEmail !== displayName && (
                <div className="user-dropdown-email">{displayEmail}</div>
              )}
            </div>
          </div>

          <div className="user-dropdown-divider" />

          {/* Actions */}
          <button className="user-dropdown-item" onClick={handleLogout}>
            <span>退出账号</span>
          </button>
        </div>
      )}
    </div>
  );
}
