"use client";

import { useEffect, useState } from 'react';

export default function VersionBanner() {
  const [hasNewVersion, setHasNewVersion] = useState(false);

  useEffect(() => {
    // Current client build time
    const clientBuildTime = process.env.NEXT_PUBLIC_BUILD_TIME || "0";
    if (clientBuildTime === "0") return;

    let intervalId: NodeJS.Timeout;

    const checkVersion = async () => {
      try {
         // Avoid caching
         const res = await fetch('/api/version?t=' + Date.now(), { cache: 'no-store' });
         const data = await res.json();
         const serverBuildTime = data.buildTime;
         if (serverBuildTime && serverBuildTime !== "0" && serverBuildTime !== clientBuildTime) {
           setHasNewVersion(true);
           clearInterval(intervalId); // Stop polling once new version found
         }
      } catch (e) {
        // Ignore network errors
      }
    };

    // Poll every 3 minutes
    intervalId = setInterval(checkVersion, 3 * 60 * 1000);

    // Initial check after 10 seconds of landing
    const timeoutId = setTimeout(checkVersion, 10000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, []);

  if (!hasNewVersion) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      background: 'var(--accent-blue, #3b82f6)',
      color: '#fff',
      padding: '8px 16px',
      textAlign: 'center',
      fontSize: '0.9rem',
      fontWeight: 500,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      animation: 'slideDown 0.3s ease-out forwards'
    }}>
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
      `}</style>
      <span>✨ 发现新版本！系统已升级体验。</span>
      <button 
        onClick={() => { window.location.reload(); }}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: 'none',
          color: '#fff',
          padding: '4px 12px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '0.8rem',
          fontWeight: 'bold',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
      >
        点击刷新即可应用
      </button>
    </div>
  );
}
