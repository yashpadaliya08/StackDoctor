import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { execCommand, ExecResponse } from '../api';

interface Props {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

export const DeploymentTerminalExecModal: React.FC<Props> = ({ projectId, projectName, onClose }) => {
  const [command, setCommand] = useState('php artisan --version');
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<ExecResponse[]>([]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const presets = [
    { label: 'Version', cmd: 'php artisan --version' },
    { label: 'Route List', cmd: 'php artisan route:list --compact' },
    { label: 'Migrate Status', cmd: 'php artisan migrate:status' },
    { label: 'Clear Cache', cmd: 'php artisan cache:clear' },
    { label: 'Clear Config', cmd: 'php artisan config:clear' },
    { label: 'Environment', cmd: 'php artisan env' },
    { label: 'Seed DB', cmd: 'php artisan db:seed --force' },
  ];

  const handleRun = async (cmdToRun?: string) => {
    const targetCmd = (cmdToRun || command).trim();
    if (!targetCmd || isRunning) return;

    setIsRunning(true);
    try {
      const res = await execCommand(projectId, targetCmd);
      setHistory((prev) => [res, ...prev]);
    } catch (e: any) {
      setHistory((prev) => [
        {
          command: targetCmd,
          exit_code: 1,
          stdout: '',
          stderr: e.message || 'Execution error',
          execution_time_sec: 0,
        },
        ...prev,
      ]);
    } finally {
      setIsRunning(false);
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
          maxWidth: '960px',
          maxHeight: '85vh',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.3rem' }}>⚡</span>
            <div>
              <div style={{ fontWeight: 700, color: '#f0f6fc', fontSize: '1rem' }}>
                Artisan &amp; System CLI Terminal — {projectName}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#8b949e' }}>
                Execute artisan, composer, npm, or bash commands directly inside the container
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
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Command Input Area */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleRun();
          }}
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid #21262d',
            background: '#0d1117',
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
          }}
        >
          <span style={{ color: '#58a6ff', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
            $
          </span>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="php artisan migrate:status"
            disabled={isRunning}
            style={{
              flex: 1,
              background: '#161b22',
              border: '1px solid #30363d',
              borderRadius: '6px',
              padding: '8px 12px',
              color: '#f0f6fc',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.85rem',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={isRunning || !command.trim()}
            style={{
              background: '#238636',
              border: '1px solid #2ea043',
              color: '#fff',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: isRunning || !command.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isRunning ? 'Running...' : 'Run ↵'}
          </button>
        </form>

        {/* Preset Shortcuts */}
        <div
          style={{
            padding: '10px 20px',
            borderBottom: '1px solid #21262d',
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            alignItems: 'center',
            background: '#161b22',
          }}
        >
          <span style={{ fontSize: '0.72rem', color: '#8b949e', fontWeight: 600, textTransform: 'uppercase' }}>
            Presets:
          </span>
          {presets.map((p) => (
            <button
              key={p.cmd}
              onClick={() => {
                setCommand(p.cmd);
                handleRun(p.cmd);
              }}
              disabled={isRunning}
              style={{
                background: '#21262d',
                border: '1px solid #30363d',
                color: '#c9d1d9',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '0.72rem',
                cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Output Console */}
        <div
          style={{
            flex: 1,
            padding: '16px 20px',
            overflowY: 'auto',
            background: '#090d13',
            minHeight: '260px',
          }}
        >
          {history.length === 0 ? (
            <div style={{ color: '#6e7681', textAlign: 'center', marginTop: '40px', fontStyle: 'italic' }}>
              No commands executed yet. Select a preset or type a command above and press Enter.
            </div>
          ) : (
            history.map((item, idx) => (
              <div
                key={idx}
                style={{
                  marginBottom: '14px',
                  backgroundColor: '#0d1117',
                  border: '1px solid #21262d',
                  borderRadius: '6px',
                  padding: '10px 14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                    borderBottom: '1px solid #21262d',
                    paddingBottom: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: item.exit_code === 0 ? '#3fb950' : '#f85149',
                      }}
                    />
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: '#58a6ff',
                      }}
                    >
                      $ {item.command}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#8b949e' }}>
                    exit: {item.exit_code} • {item.execution_time_sec.toFixed(2)}s
                  </span>
                </div>

                <pre
                  style={{
                    margin: 0,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.8rem',
                    color: item.exit_code === 0 ? '#c9d1d9' : '#fca5a5',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    lineHeight: '1.45',
                  }}
                >
                  {item.stdout || item.stderr || '(No output returned)'}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
