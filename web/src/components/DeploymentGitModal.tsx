import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { fetchCicdConfig, fetchReleaseHistory, triggerRollback, triggerGitSync, CicdRelease, WebhookConfig } from '../api';

interface Props {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

export const DeploymentGitModal: React.FC<Props> = ({ projectId, projectName, onClose }) => {
  const [activeTab, setActiveTab] = useState<'webhook' | 'history'>('history');
  const [config, setConfig] = useState<WebhookConfig | null>(null);
  const [history, setHistory] = useState<CicdRelease[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRollingBack, setIsRollingBack] = useState<string | null>(null);
  const [rollbackMsg, setRollbackMsg] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // 1-Click Git Sync state
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);

  // Lock body scroll while modal is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [cfg, hist] = await Promise.all([
        fetchCicdConfig(projectId),
        fetchReleaseHistory(projectId),
      ]);
      setConfig(cfg);
      if (cfg?.repo_url) setRepoUrl(cfg.repo_url);
      if (cfg?.tracked_branch) setBranch(cfg.tracked_branch);
      setHistory(hist.history || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const url = repoUrl.trim();
    if (!url) {
      setSyncErrorMsg('Please enter your GitHub repository URL (e.g. https://github.com/username/swiftride).');
      return;
    }
    setIsSyncing(true);
    setSyncSuccessMsg(null);
    setSyncErrorMsg(null);
    setRollbackMsg(null);
    try {
      const res = await triggerGitSync(projectId, url, branch.trim() || 'main');
      setSyncSuccessMsg(res.message);
      await loadData();
    } catch (err: any) {
      setSyncErrorMsg(err.message || 'Failed to sync latest commit from GitHub.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRollback = async (versionId: string) => {
    if (!confirm(`Are you sure you want to rollback to ${versionId}? This will switch live traffic immediately.`)) {
      return;
    }
    setIsRollingBack(versionId);
    setRollbackMsg(null);
    try {
      const res = await triggerRollback(projectId, versionId);
      setRollbackMsg(res.message);
      await loadData();
    } catch (e: any) {
      alert(`Rollback failed: ${e.message}`);
    } finally {
      setIsRollingBack(null);
    }
  };

  const copyToClipboard = (text: string, isSecret = false) => {
    navigator.clipboard.writeText(text);
    if (isSecret) {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } else {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
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
    >
      <div
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '740px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 30px rgba(56, 189, 248, 0.1)',
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
              <span>🚀</span> CI/CD & Automated Git Deployments
              <span
                style={{
                  backgroundColor: '#0284c7',
                  color: '#fff',
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontWeight: 600,
                }}
              >
                {projectName}
              </span>
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#94a3b8' }}>
              Auto-deploy on GitHub push, track release commits, and perform 1-click zero-downtime rollbacks.
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

        {/* Tab Switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', padding: '0 20px', background: '#090d16' }}>
          <button
            onClick={() => setActiveTab('history')}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'history' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'history' ? '#38bdf8' : '#94a3b8',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            📜 Release History & Rollbacks ({history.length})
          </button>
          <button
            onClick={() => setActiveTab('webhook')}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'webhook' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'webhook' ? '#38bdf8' : '#94a3b8',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            🔗 Webhook Setup (GitHub / GitLab)
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {rollbackMsg && (
            <div
              style={{
                background: '#064e3b',
                border: '1px solid #059669',
                color: '#34d399',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                marginBottom: '16px',
              }}
            >
              ✔ {rollbackMsg}
            </div>
          )}

          {/* Sync Success Alert */}
          {syncSuccessMsg && (
            <div
              style={{
                background: 'rgba(5, 150, 105, 0.15)',
                border: '1px solid #059669',
                color: '#34d399',
                padding: '12px 16px',
                borderRadius: '8px',
                fontSize: '12px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px' }}>🚀</span>
                <strong>{syncSuccessMsg}</strong>
              </div>
              <button
                onClick={() => setSyncSuccessMsg(null)}
                style={{ background: 'none', border: 'none', color: '#34d399', cursor: 'pointer', fontSize: '14px' }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Sync Error Alert */}
          {syncErrorMsg && (
            <div
              style={{
                background: 'rgba(220, 38, 38, 0.15)',
                border: '1px solid #dc2626',
                color: '#f87171',
                padding: '12px 16px',
                borderRadius: '8px',
                fontSize: '12px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px' }}>⚠</span>
                <span>{syncErrorMsg}</span>
              </div>
              <button
                onClick={() => setSyncErrorMsg(null)}
                style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '14px' }}
              >
                ✕
              </button>
            </div>
          )}

          {/* 1-Click Pull & Deploy Card */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '10px',
              padding: '16px 18px',
              marginBottom: '20px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>⚡</span>
                <h4 style={{ margin: 0, fontSize: '13px', color: '#f8fafc', fontWeight: 700 }}>
                  1-Click GitHub Pull & Deploy
                </h4>
              </div>
              <span style={{ fontSize: '11px', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)', padding: '2px 8px', borderRadius: '12px' }}>
                Instant Sync • No Webhook Needed
              </span>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
              Pushed new code to GitHub? Enter your repo URL and click <strong>Fetch & Deploy</strong>. StackDoctor pulls the commit, hot-reloads your app, and registers the release.
            </p>
            <form onSubmit={handleSync} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px' }}>
                <input
                  type="text"
                  placeholder="https://github.com/username/swiftride"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  disabled={isSyncing}
                  style={{
                    width: '100%',
                    background: '#090d16',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ width: '90px' }}>
                <input
                  type="text"
                  placeholder="main"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  disabled={isSyncing}
                  style={{
                    width: '100%',
                    background: '#090d16',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: '#a78bfa',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    textAlign: 'center',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={isSyncing}
                style={{
                  background: isSyncing ? '#0369a1' : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  border: '1px solid #38bdf8',
                  borderRadius: '6px',
                  color: '#fff',
                  padding: '8px 18px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: isSyncing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 10px rgba(2, 132, 199, 0.3)',
                }}
              >
                {isSyncing ? (
                  <>
                    <span>⏳</span>
                    Pulling & Deploying...
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    Fetch & Deploy Latest Commit
                  </>
                )}
              </button>
            </form>
          </div>

          {activeTab === 'history' ? (
            <div>
              {isLoading ? (
                <div style={{ color: '#94a3b8', textAlign: 'center', padding: '30px' }}>Loading release history...</div>
              ) : history.length === 0 ? (
                <div style={{ color: '#94a3b8', textAlign: 'center', padding: '30px' }}>No release history found yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {history.map((rel) => {
                    const isActive = rel.status === 'ACTIVE';
                    return (
                      <div
                        key={rel.version_id}
                        style={{
                          background: isActive ? '#064e3b22' : '#1e293b44',
                          border: isActive ? '1px solid #059669' : '1px solid #334155',
                          borderRadius: '8px',
                          padding: '14px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span
                            style={{
                              background: isActive ? '#059669' : '#475569',
                              color: '#fff',
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '4px',
                            }}
                          >
                            {rel.version_id}
                          </span>
                          <div>
                            <div style={{ color: '#f8fafc', fontWeight: 600, fontSize: '13px' }}>
                              {rel.commit_msg}
                            </div>
                            <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                              Commit <code style={{ color: '#38bdf8' }}>{rel.commit_hash}</code> • Branch <code style={{ color: '#a78bfa' }}>{rel.branch}</code> • Author: {rel.author} • {new Date(rel.timestamp).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <div>
                          {isActive ? (
                            <span
                              style={{
                                color: '#34d399',
                                fontWeight: 700,
                                fontSize: '11px',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                background: '#064e3b',
                                border: '1px solid #059669',
                              }}
                            >
                              ● CURRENT LIVE
                            </span>
                          ) : (
                            <button
                              onClick={() => handleRollback(rel.version_id)}
                              disabled={isRollingBack === rel.version_id}
                              style={{
                                background: '#1e293b',
                                border: '1px solid #475569',
                                color: '#f8fafc',
                                padding: '5px 12px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              {isRollingBack === rel.version_id ? 'Rolling back...' : '↩ Rollback to this'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div>
              <p style={{ color: '#cbd5e1', fontSize: '13px', margin: '0 0 16px', lineHeight: 1.6 }}>
                Connect your GitHub repository to enable automatic push-to-deploy. When anyone pushes to the tracked branch, StackDoctor pulls code, runs migrations, and hot-reloads your edge container.
              </p>

              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                  Payload Webhook URL
                </label>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <input
                    readOnly
                    value={config?.webhook_url || ''}
                    style={{
                      flex: 1,
                      background: '#1e293b',
                      border: '1px solid #334155',
                      color: '#38bdf8',
                      fontFamily: 'monospace',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                  />
                  <button
                    onClick={() => copyToClipboard(config?.webhook_url || '')}
                    style={{
                      background: copiedUrl ? '#059669' : '#0284c7',
                      color: '#fff',
                      border: 'none',
                      padding: '8px 14px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {copiedUrl ? '✔ Copied' : '📋 Copy URL'}
                  </button>
                </div>
              </div>

              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                  Secret Token (Optional)
                </label>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <input
                    readOnly
                    value={config?.secret_token || ''}
                    style={{
                      flex: 1,
                      background: '#1e293b',
                      border: '1px solid #334155',
                      color: '#fbbf24',
                      fontFamily: 'monospace',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                  />
                  <button
                    onClick={() => copyToClipboard(config?.secret_token || '', true)}
                    style={{
                      background: copiedSecret ? '#059669' : '#334155',
                      color: '#fff',
                      border: 'none',
                      padding: '8px 14px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {copiedSecret ? '✔ Copied' : '📋 Copy Secret'}
                  </button>
                </div>
              </div>

              <div style={{ background: '#1e293b44', borderRadius: '8px', padding: '14px', fontSize: '12px', color: '#94a3b8' }}>
                <strong style={{ color: '#f8fafc' }}>Quick GitHub Setup:</strong>
                <ol style={{ margin: '8px 0 0', paddingLeft: '20px', lineHeight: 1.6 }}>
                  <li>Go to your repository settings on GitHub &rarr; <strong>Webhooks</strong> &rarr; <strong>Add webhook</strong></li>
                  <li>Paste the <strong>Payload URL</strong> above.</li>
                  <li>Set Content type to <code style={{ color: '#38bdf8' }}>application/json</code>.</li>
                  <li>Select <em>"Just the push event"</em> and click <strong>Add webhook</strong>.</li>
                </ol>
              </div>
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
