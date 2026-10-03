import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { fetchWatchdogStatus, toggleWatchdog, WatchdogStatus } from '../api';

interface Props {
  onClose: () => void;
}

export const WatchdogStatusModal: React.FC<Props> = ({ onClose }) => {
  const [status, setStatus] = useState<WatchdogStatus | null>(null);
  const [toggling, setToggling] = useState(false);

  // Lock body scroll while modal is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const data = await fetchWatchdogStatus();
      if (data) setStatus(data);
    } catch (e) {
      console.error('Watchdog status error:', e);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      await toggleWatchdog();
      await loadStatus();
    } catch (e) {
      console.error('Toggle error:', e);
    } finally {
      setToggling(false);
    }
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(3, 7, 18, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '720px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #21262d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#161b22',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.4rem' }}>🛡️</span>
            <div>
              <div style={{ fontWeight: 700, color: '#f0f6fc', fontSize: '1rem' }}>
                24/7 Phone Watchdog & Auto-Healer
              </div>
              <div style={{ fontSize: '0.75rem', color: '#8b949e' }}>
                Autonomous supervisor monitoring loopback ports and reviving crashed apps
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#8b949e',
              fontSize: '1.2rem',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Stats Bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
            }}
          >
            <div
              style={{
                background: '#161b22',
                border: '1px solid #21262d',
                borderRadius: '10px',
                padding: '12px 16px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: '#8b949e', marginBottom: '4px' }}>Supervisor Status</div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  color: status?.enabled ? '#34d399' : '#f87171',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: status?.enabled ? '#34d399' : '#f87171',
                    boxShadow: status?.enabled ? '0 0 8px #34d399' : 'none',
                  }}
                />
                {status?.enabled ? 'ACTIVE (Watching)' : 'PAUSED'}
              </div>
            </div>

            <div
              style={{
                background: '#161b22',
                border: '1px solid #21262d',
                borderRadius: '10px',
                padding: '12px 16px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: '#8b949e', marginBottom: '4px' }}>Total Health Probes</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#f0f6fc' }}>
                {status?.total_checks || 0}
              </div>
            </div>

            <div
              style={{
                background: '#161b22',
                border: '1px solid #21262d',
                borderRadius: '10px',
                padding: '12px 16px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: '#8b949e', marginBottom: '4px' }}>Auto-Heals Revived</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#60a5fa' }}>
                {status?.total_heals || 0}
              </div>
            </div>
          </div>

          {/* Toggle Button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#161b22', padding: '12px 16px', borderRadius: '10px', border: '1px solid #21262d' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#f0f6fc', fontSize: '0.85rem' }}>Auto-Healing Daemon</div>
              <div style={{ color: '#8b949e', fontSize: '0.75rem' }}>
                Probes port status every {status?.check_interval_sec || 25}s and auto-restarts dead services
              </div>
            </div>
            <button
              onClick={handleToggle}
              disabled={toggling}
              style={{
                background: status?.enabled ? '#dc2626' : '#059669',
                color: '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              {toggling ? 'Updating...' : status?.enabled ? 'Pause Supervisor' : 'Enable Supervisor'}
            </button>
          </div>

          {/* Recent Event Log */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#8b949e', marginBottom: '8px' }}>
              SUPERVISOR AUDIT LOG:
            </div>
            <div
              style={{
                background: '#090d13',
                border: '1px solid #21262d',
                borderRadius: '8px',
                padding: '12px',
                maxHeight: '260px',
                overflowY: 'auto',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.78rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {!status?.recent_events || status.recent_events.length === 0 ? (
                <div style={{ color: '#6e7681', textAlign: 'center', padding: '16px' }}>
                  No healing events triggered yet. All services running healthy.
                </div>
              ) : (
                status.recent_events.map((evt, i) => (
                  <div key={i} style={{ borderBottom: '1px solid #161b22', paddingBottom: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#8b949e', fontSize: '0.7rem' }}>
                      <span>[{evt.category}]</span>
                      <span>{evt.timestamp.split('T')[1]?.slice(0, 8)}</span>
                    </div>
                    <div style={{ color: evt.category.includes('SUCCESS') ? '#34d399' : '#f87171', marginTop: '2px' }}>
                      {evt.message}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
