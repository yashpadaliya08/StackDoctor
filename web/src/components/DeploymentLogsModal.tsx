import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { fetchAppLogs, clearAppLogs, AppLogsResponse } from '../api';

interface Props {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

export const DeploymentLogsModal: React.FC<Props> = ({ projectId, projectName, onClose }) => {
  const [logs, setLogs] = useState<AppLogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState<'laravel' | 'server'>('laravel');
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Lock background body scroll while modal is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const loadLogs = async () => {
    try {
      const data = await fetchAppLogs(projectId, 200);
      setLogs(data);
    } catch (e) {
      console.error('Logs fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [projectId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      loadLogs();
    }, 3000);
    return () => clearInterval(timer);
  }, [autoRefresh, projectId]);

  // Scroll ONLY inside the log container without scrolling the main window/page
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, activeTab, autoScroll]);

  const handleClear = async () => {
    if (!confirm('Are you sure you want to truncate application log files?')) return;
    setClearing(true);
    try {
      await clearAppLogs(projectId);
      await loadLogs();
    } catch (e) {
      console.error('Clear error:', e);
    } finally {
      setClearing(false);
    }
  };

  const rawText = logs ? (activeTab === 'laravel' ? logs.laravel_log : logs.server_log) : '';
  const lines = rawText ? rawText.split('\n') : [];
  const filteredLines = search
    ? lines.filter((l) => l.toLowerCase().includes(search.toLowerCase()))
    : lines;

  const renderColoredLine = (line: string, idx: number) => {
    let color = '#d1d5db';
    if (line.includes('ERROR') || line.includes('Fatal') || line.includes('Exception') || line.includes('failed')) {
      color = '#f87171';
    } else if (line.includes('WARNING') || line.includes('WARN')) {
      color = '#fbbf24';
    } else if (line.includes('INFO') || line.includes('HTTP/1.') || line.includes('200 OK')) {
      color = '#34d399';
    } else if (line.includes('SQL') || line.includes('select') || line.includes('insert')) {
      color = '#93c5fd';
    }

    return (
      <div
        key={idx}
        style={{
          display: 'flex',
          gap: '12px',
          padding: '2px 0',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.8rem',
          lineHeight: '1.4',
        }}
      >
        <span style={{ color: '#4b5563', userSelect: 'none', minWidth: '32px', textAlign: 'right' }}>
          {idx + 1}
        </span>
        <span style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{line}</span>
      </div>
    );
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
          maxWidth: '1000px',
          height: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.2rem' }}>📜</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#f0f6fc' }}>
                Application Logs: <span style={{ color: '#58a6ff' }}>{projectName || projectId}</span>
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#8b949e' }}>
                Live stdout, stderr, and storage/logs/laravel.log from phone host
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Auto refresh badge */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              style={{
                background: autoRefresh ? 'rgba(16, 185, 129, 0.15)' : 'rgba(107, 114, 128, 0.15)',
                border: `1px solid ${autoRefresh ? '#10b981' : '#4b5563'}`,
                color: autoRefresh ? '#34d399' : '#9ca3af',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: autoRefresh ? '#10b981' : '#6b7280',
                  boxShadow: autoRefresh ? '0 0 6px #10b981' : 'none',
                }}
              />
              {autoRefresh ? 'Live Streaming' : 'Stream Paused'}
            </button>

            <button
              onClick={handleClear}
              disabled={clearing}
              style={{
                background: '#21262d',
                border: '1px solid #30363d',
                color: '#f87171',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              {clearing ? 'Clearing...' : '🗑️ Clear Logs'}
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#8b949e',
                fontSize: '1.2rem',
                cursor: 'pointer',
                padding: '0 4px',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Controls and Tabs */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid #21262d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#0d1117',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setActiveTab('laravel')}
              style={{
                background: activeTab === 'laravel' ? '#1f6feb' : '#21262d',
                color: '#fff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🐘 Laravel Logs (storage/logs)
            </button>
            <button
              onClick={() => setActiveTab('server')}
              style={{
                background: activeTab === 'server' ? '#1f6feb' : '#21262d',
                color: '#fff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ⚡ Server stdout/stderr
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="text"
              placeholder="Search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                background: '#161b22',
                border: '1px solid #30363d',
                color: '#c9d1d9',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                width: '180px',
              }}
            />
            <label style={{ fontSize: '0.75rem', color: '#8b949e', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              Auto-scroll
            </label>
          </div>
        </div>

        {/* Terminal Body */}
        <div
          ref={logContainerRef}
          style={{
            flex: 1,
            padding: '16px 20px',
            overflowY: 'auto',
            background: '#090d13',
          }}
        >
          {loading && !logs ? (
            <div style={{ color: '#8b949e', textAlign: 'center', marginTop: '40px' }}>
              Connecting to phone SSH and streaming logs...
            </div>
          ) : filteredLines.length === 0 ? (
            <div style={{ color: '#6e7681', textAlign: 'center', marginTop: '40px', fontStyle: 'italic' }}>
              No log entries recorded yet for this application.
            </div>
          ) : (
            filteredLines.map((line, idx) => renderColoredLine(line, idx))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
