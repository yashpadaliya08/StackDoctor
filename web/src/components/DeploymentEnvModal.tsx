import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { fetchEnvVariables, updateEnvVariables, EnvItem } from '../api';

interface Props {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

export const DeploymentEnvModal: React.FC<Props> = ({ projectId, projectName, onClose }) => {
  const [items, setItems] = useState<EnvItem[]>([]);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; success: boolean; live_url?: string } | null>(null);

  // Lock body scroll while modal is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    loadEnv();
  }, [projectId]);

  const loadEnv = async () => {
    setLoading(true);
    try {
      const res = await fetchEnvVariables(projectId);
      setItems(res.env_items);
    } catch (e) {
      console.error('Failed to fetch env:', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleValueChange = (key: string, val: string) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, value: val } : item))
    );
  };

  const handleDelete = (key: string) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
  };

  const handleAdd = () => {
    const k = newKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (!k) return;
    if (items.some((i) => i.key === k)) {
      alert(`Variable ${k} already exists!`);
      return;
    }
    const isSec = ['KEY', 'SECRET', 'PASS', 'TOKEN', 'PWD', 'AUTH'].some((kw) => k.includes(kw));
    setItems((prev) => [...prev, { key: k, value: newValue.trim(), is_secret: isSec }]);
    setNewKey('');
    setNewValue('');
  };

  const handleSaveAndHotReload = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const envMap: Record<string, string> = {};
      items.forEach((item) => {
        if (item.key) envMap[item.key] = item.value;
      });
      const res = await updateEnvVariables(projectId, envMap);
      setStatusMsg({
        text: `✔ ${res.message || 'Saved and hot-restarted successfully!'}`,
        success: true,
        live_url: res.live_url,
      });
    } catch (e: any) {
      setStatusMsg({
        text: `❌ ${e.message || 'Failed to update environment variables.'}`,
        success: false,
      });
    } finally {
      setSaving(false);
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
          maxWidth: '920px',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.3rem' }}>🔐</span>
            <div>
              <div style={{ fontWeight: 700, color: '#f0f6fc', fontSize: '1rem' }}>
                Environment Variables & Secrets — {projectName}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#8b949e' }}>
                Hot-reload updates .env and automatically reboots the application process
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

        {/* Status banner if any */}
        {statusMsg && (
          <div
            style={{
              padding: '10px 20px',
              background: statusMsg.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              borderBottom: `1px solid ${statusMsg.success ? '#10b981' : '#ef4444'}`,
              color: statusMsg.success ? '#34d399' : '#f87171',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <span>{statusMsg.text}</span>
            {statusMsg.live_url && (
              <a
                href={statusMsg.live_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  backgroundColor: '#10b981',
                  color: '#0b0f17',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                🚀 Open Live Site
              </a>
            )}
          </div>
        )}

        {/* Variables List */}
        <div
          style={{
            flex: 1,
            padding: '20px',
            overflowY: 'auto',
            background: '#090d13',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {loading ? (
            <div style={{ color: '#8b949e', textAlign: 'center', marginTop: '40px' }}>Loading environment variables...</div>
          ) : (
            items.map((item) => {
              const isRevealed = revealedKeys[item.key];
              return (
                <div
                  key={item.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: '#161b22',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid #30363d',
                  }}
                >
                  <span
                    style={{
                      minWidth: '220px',
                      color: item.is_secret ? '#f59e0b' : '#58a6ff',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '0.82rem',
                      fontWeight: 600,
                    }}
                  >
                    {item.key}
                  </span>

                  <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={item.is_secret && !isRevealed ? 'password' : 'text'}
                      value={item.value}
                      onChange={(e) => handleValueChange(item.key, e.target.value)}
                      style={{
                        width: '100%',
                        background: '#0d1117',
                        border: '1px solid #30363d',
                        color: '#c9d1d9',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '0.82rem',
                      }}
                    />
                    {item.is_secret && (
                      <button
                        type="button"
                        onClick={() => toggleReveal(item.key)}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          background: 'none',
                          border: 'none',
                          color: '#8b949e',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                        }}
                      >
                        {isRevealed ? '🙈' : '👁️'}
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => handleDelete(item.key)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#f87171',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      padding: '4px',
                    }}
                    title="Delete Variable"
                  >
                    🗑️
                  </button>
                </div>
              );
            })
          )}

          {/* Add New Variable Row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: '#111827',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px dashed #374151',
              marginTop: '10px',
            }}
          >
            <input
              type="text"
              placeholder="NEW_VARIABLE_NAME"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              style={{
                minWidth: '220px',
                background: '#0d1117',
                border: '1px solid #30363d',
                color: '#34d399',
                padding: '6px 10px',
                borderRadius: '6px',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.82rem',
                textTransform: 'uppercase',
              }}
            />
            <input
              type="text"
              placeholder="value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              style={{
                flex: 1,
                background: '#0d1117',
                border: '1px solid #30363d',
                color: '#c9d1d9',
                padding: '6px 10px',
                borderRadius: '6px',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.82rem',
              }}
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newKey.trim()}
              style={{
                background: '#21262d',
                border: '1px solid #30363d',
                color: '#58a6ff',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: !newKey.trim() ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              + Add
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #21262d',
            background: '#161b22',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '0.78rem', color: '#8b949e' }}>
            Total Variables: <strong style={{ color: '#f0f6fc' }}>{items.length}</strong>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onClose}
              style={{
                background: '#21262d',
                border: '1px solid #30363d',
                color: '#c9d1d9',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>

            <button
              onClick={handleSaveAndHotReload}
              disabled={saving}
              style={{
                background: '#238636',
                color: '#fff',
                border: 'none',
                padding: '8px 20px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {saving ? 'Hot-Reloading...' : '⚡ Save & Hot-Reload'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
