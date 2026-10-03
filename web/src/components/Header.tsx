import React from 'react';
import { Activity, ShieldCheck, Sparkles } from 'lucide-react';

interface Props {
  onOpenAudit?: () => void;
  onOpenWatchdog?: () => void;
}

export const Header: React.FC<Props> = ({ onOpenAudit, onOpenWatchdog }) => {
  return (
    <header
      className="glass-card"
      style={{
        padding: '18px 26px',
        marginBottom: '26px',
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.75) 0%, rgba(6, 9, 20, 0.85) 100%)',
        border: '1px solid var(--border-glass-medium)',
        boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        {/* Brand & Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #06b6d4 0%, #10b981 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 25px -4px rgba(6, 182, 212, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.4)',
            }}
          >
            <Activity size={24} color="#ffffff" strokeWidth={2.5} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1
                style={{
                  fontSize: '1.6rem',
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                }}
              >
                <span>Stack</span>
                <span className="text-gradient-cyan">Doctor</span>
              </h1>
              <span
                style={{
                  background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%)',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                  color: '#38bdf8',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  letterSpacing: '0.05em',
                }}
              >
                EDGE CLOUD OS
              </span>
              <span
                style={{
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#34d399',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Sparkles size={10} /> PRO EDITION
              </span>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0 0 0', fontWeight: 400 }}>
              Autonomous Diagnostics, Zero-DevOps Repair & 24/7 ARM Edge Cloud (Laravel • MERN • Python)
            </p>
          </div>
        </div>

        {/* Status Indicators & Fast Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Live Engine Indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              background: 'rgba(6, 78, 59, 0.4)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              borderRadius: '9999px',
              fontSize: '0.8rem',
              color: '#34d399',
              fontWeight: 600,
            }}
          >
            <span className="pulse-indicator">
              <span className="pulse-ring" />
              <span className="pulse-dot" />
            </span>
            Edge Engine Active
          </div>

          {/* Sandboxed Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: 'rgba(30, 41, 59, 0.4)',
              border: '1px solid var(--border-glass-subtle)',
              borderRadius: '9999px',
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              fontWeight: 500,
            }}
          >
            <ShieldCheck size={14} color="#06b6d4" />
            Isolated Sandbox
          </div>

          {/* Quick Action: Audit */}
          {onOpenAudit && (
            <button
              onClick={onOpenAudit}
              className="btn btn-outline"
              style={{
                padding: '6px 14px',
                fontSize: '0.78rem',
                borderRadius: '9999px',
                borderColor: 'rgba(244, 63, 94, 0.3)',
                color: '#fecdd3',
              }}
            >
              🛡️ Audit Trail
            </button>
          )}

          {/* Quick Action: Watchdog */}
          {onOpenWatchdog && (
            <button
              onClick={onOpenWatchdog}
              className="btn btn-outline"
              style={{
                padding: '6px 14px',
                fontSize: '0.78rem',
                borderRadius: '9999px',
                borderColor: 'rgba(6, 182, 212, 0.3)',
                color: '#38bdf8',
              }}
            >
              ⚡ Watchdog
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
