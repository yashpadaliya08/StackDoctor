import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { fetchAuditLogs, fetchRateLimitStats, AuditLogEntry } from '../api';

interface Props {
  onClose: () => void;
}

export const SecurityAuditModal: React.FC<Props> = ({ onClose }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [rateStats, setRateStats] = useState<any>(null);
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Lock body scroll while modal is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    loadLogs();
  }, [filterAction]);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const [logData, rateData] = await Promise.all([
        fetchAuditLogs(50, filterAction, searchQuery),
        fetchRateLimitStats(),
      ]);
      setLogs(logData.logs || []);
      setRateStats(rateData);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadLogs();
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes('EXEC')) return { bg: '#78350f', text: '#fbbf24', border: '#b45309' };
    if (action.includes('DB') || action.includes('SQL')) return { bg: '#581c87', text: '#c084fc', border: '#7e22ce' };
    if (action.includes('DEPLOY') || action.includes('BOOT')) return { bg: '#064e3b', text: '#34d399', border: '#059669' };
    if (action.includes('ROLLBACK')) return { bg: '#701a75', text: '#f472b6', border: '#a21caf' };
    if (action.includes('AUTO_HEAL')) return { bg: '#1e3a8a', text: '#60a5fa', border: '#2563eb' };
    return { bg: '#1e293b', text: '#94a3b8', border: '#475569' };
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
    >
      <div
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '820px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 30px rgba(244, 63, 94, 0.1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🛡️</span> Security & Immutable Audit Trail
              <span
                style={{
                  backgroundColor: '#9f1239',
                  color: '#fff',
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontWeight: 600,
                }}
              >
                COMPLIANCE READY
              </span>
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#94a3b8' }}>
              Real-time audit log of terminal executions, database modifications, environment edits, and DDoS rate protection.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Rate Limiter Status Banner */}
        {rateStats && (
          <div
            style={{
              padding: '12px 20px',
              background: '#090d16',
              borderBottom: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', gap: '16px', color: '#cbd5e1' }}>
              <span>
                🛡️ <strong>DDoS Shield:</strong> <span style={{ color: '#34d399' }}>ACTIVE</span>
              </span>
              <span>
                ⚡ <strong>Window Limit:</strong> {rateStats.max_requests_per_min} req/min
              </span>
              <span>
                🌐 <strong>Active IPs:</strong> {rateStats.active_client_ips}
              </span>
              <span>
                🚫 <strong>Blocked Requests:</strong> {rateStats.blocked_requests_total}
              </span>
            </div>
            <button
              onClick={loadLogs}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#38bdf8',
                padding: '3px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              🔄 Refresh
            </button>
          </div>
        )}

        {/* Controls Row */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #1e293b', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {/* Action Filters */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {['ALL', 'EXEC_COMMAND', 'DB_QUERY', 'DEPLOY', 'ROLLBACK', 'AUTO_HEAL'].map((act) => (
              <button
                key={act}
                onClick={() => setFilterAction(act)}
                style={{
                  background: filterAction === act ? '#0284c7' : '#1e293b',
                  color: filterAction === act ? '#fff' : '#94a3b8',
                  border: '1px solid #334155',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {act}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} style={{ flex: 1, minWidth: '200px', display: 'flex', gap: '6px' }}>
            <input
              type="text"
              placeholder="Search audit trail..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#f8fafc',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
              }}
            />
            <button
              type="submit"
              style={{
                background: '#334155',
                color: '#fff',
                border: 'none',
                padding: '4px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Search
            </button>
          </form>
        </div>

        {/* Logs Table */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          {isLoading ? (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: '30px' }}>Loading audit records...</div>
          ) : logs.length === 0 ? (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: '30px' }}>No audit records found matching criteria.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {logs.map((log) => {
                const badge = getActionBadgeColor(log.action);
                return (
                  <div
                    key={log.id}
                    style={{
                      background: '#1e293b33',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                      <span
                        style={{
                          background: badge.bg,
                          color: badge.text,
                          border: `1px solid ${badge.border}`,
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {log.action}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#f8fafc', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                          {log.details}
                        </div>
                        <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>
                          Target: <code style={{ color: '#38bdf8' }}>{log.project_id}</code> • Actor: <strong>{log.actor}</strong> ({log.client_ip})
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          color: log.status === 'SUCCESS' ? '#34d399' : '#f87171',
                          fontWeight: 700,
                          fontSize: '10px',
                          display: 'block',
                        }}
                      >
                        {log.status}
                      </span>
                      <span style={{ color: '#64748b', fontSize: '10px' }}>
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'flex-end',
            background: '#090d16',
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: '#334155',
              border: 'none',
              color: '#fff',
              padding: '6px 16px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
