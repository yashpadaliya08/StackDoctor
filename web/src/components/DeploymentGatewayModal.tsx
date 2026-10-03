import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  DeploymentRecord,
  GatewayRoute,
  fetchGatewayRoutes,
  updateProjectSlug,
  fetchCloudflareWorkerScript
} from '../api';

interface Props {
  deployments: DeploymentRecord[];
  initialSelectedProjectId?: string;
  onClose: () => void;
  onRefresh: () => void;
}

export const DeploymentGatewayModal: React.FC<Props> = ({
  deployments: _deployments,
  initialSelectedProjectId,
  onClose,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<'slugs' | 'worker' | 'how_it_works'>('slugs');
  const [routes, setRoutes] = useState<GatewayRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [workerScript, setWorkerScript] = useState('');
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [copiedWorker, setCopiedWorker] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(initialSelectedProjectId || null);
  const [customSlugInput, setCustomSlugInput] = useState('');
  const [updatingSlug, setUpdatingSlug] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Lock body scroll
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [routesRes, workerRes] = await Promise.all([
        fetchGatewayRoutes(),
        fetchCloudflareWorkerScript().catch(() => '')
      ]);
      setRoutes(routesRes.routes || []);
      setWorkerScript(workerRes);
      
      if (initialSelectedProjectId) {
        const found = (routesRes.routes || []).find(r => r.project_id === initialSelectedProjectId);
        if (found) {
          setCustomSlugInput(found.slug);
        }
      }
    } catch (e: any) {
      console.error('Failed to load gateway data:', e);
      setStatusMsg({ type: 'error', text: 'Could not fetch gateway configuration.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = (slug: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2200);
  };

  const handleCopyWorker = () => {
    navigator.clipboard.writeText(workerScript);
    setCopiedWorker(true);
    setTimeout(() => setCopiedWorker(false), 2500);
  };

  const handleSaveSlug = async (projectId: string) => {
    const clean = customSlugInput.trim().toLowerCase();
    if (!clean) return;

    setUpdatingSlug(true);
    setStatusMsg(null);
    try {
      const res = await updateProjectSlug(projectId, clean, true);
      setStatusMsg({
        type: 'success',
        text: `Permanent link updated! URL is now /live/${res.route.slug}`
      });
      setEditingProjectId(null);
      await loadData();
      onRefresh();
    } catch (e: any) {
      setStatusMsg({
        type: 'error',
        text: e.message || 'Failed to update permanent slug'
      });
    } finally {
      setUpdatingSlug(false);
    }
  };

  const originUrl = window.location.origin;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 20, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: '880px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '20px',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(56, 189, 248, 0.1)',
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(9, 13, 22, 0.98) 100%)',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {/* Ambient Top Glow */}
        <div
          style={{
            position: 'absolute',
            top: '-50px',
            left: '30%',
            width: '300px',
            height: '140px',
            background: 'radial-gradient(circle, rgba(56, 189, 248, 0.15) 0%, transparent 70%)',
            pointerEvents: 'none'
          }}
        />

        {/* Modal Header */}
        <div
          style={{
            padding: '24px 28px 18px 28px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.4rem' }}>🌐</span>
              <h2
                style={{
                  margin: 0,
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: '#f8fafc'
                }}
              >
                Permanent Dynamic Redirect Gateway
              </h2>
              <span
                style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  padding: '3px 9px',
                  borderRadius: '12px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em'
                }}
              >
                REBOOT-SAFE
              </span>
            </div>
            <p
              style={{
                margin: '4px 0 0 0',
                fontSize: '0.82rem',
                color: 'var(--text-secondary)'
              }}
            >
              Unchanging shareable links for phone apps. Even when the phone reboots or tunnel URLs rotate, your permanent link never breaks.
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: 'var(--text-secondary)',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.1rem',
              transition: 'all 0.15s ease'
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '0 28px',
            backgroundColor: 'rgba(5, 8, 20, 0.4)',
            gap: '8px'
          }}
        >
          <button
            onClick={() => setActiveTab('slugs')}
            style={{
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'slugs' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'slugs' ? '#38bdf8' : 'var(--text-secondary)',
              fontWeight: activeTab === 'slugs' ? 700 : 500,
              fontSize: '0.86rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span>🔗</span> Permanent Links ({routes.length})
          </button>

          <button
            onClick={() => setActiveTab('worker')}
            style={{
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'worker' ? '2px solid #f59e0b' : '2px solid transparent',
              color: activeTab === 'worker' ? '#fbbf24' : 'var(--text-secondary)',
              fontWeight: activeTab === 'worker' ? 700 : 500,
              fontSize: '0.86rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span>⚡</span> Free Cloudflare Worker ($0 / No Domain)
          </button>

          <button
            onClick={() => setActiveTab('how_it_works')}
            style={{
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'how_it_works' ? '2px solid #10b981' : '2px solid transparent',
              color: activeTab === 'how_it_works' ? '#34d399' : 'var(--text-secondary)',
              fontWeight: activeTab === 'how_it_works' ? 700 : 500,
              fontSize: '0.86rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span>🛡️</span> How Self-Healing Works
          </button>
        </div>

        {/* Status Message */}
        {statusMsg && (
          <div
            style={{
              padding: '10px 28px',
              backgroundColor: statusMsg.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              borderBottom: statusMsg.type === 'success' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
              color: statusMsg.type === 'success' ? '#34d399' : '#f87171',
              fontSize: '0.84rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <span>{statusMsg.text}</span>
            <button
              onClick={() => setStatusMsg(null)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Tab Content Area */}
        <div
          style={{
            padding: '24px 28px',
            overflowY: 'auto',
            flex: 1
          }}
        >
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
              <div className="pulse-indicator" style={{ margin: '0 auto 12px auto' }} />
              Loading permanent gateway routes...
            </div>
          ) : activeTab === 'slugs' ? (
            <div>
              {/* Informational banner */}
              <div
                style={{
                  background: 'rgba(56, 189, 248, 0.07)',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  borderRadius: '12px',
                  padding: '14px 18px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px'
                }}
              >
                <span style={{ fontSize: '1.2rem', marginTop: '2px' }}>💡</span>
                <div style={{ fontSize: '0.82rem', lineHeight: '1.45', color: '#cbd5e1' }}>
                  <strong>How Permanent Links Work:</strong> You give your clients or users the link below (e.g.{' '}
                  <code style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>/live/swiftride</code>). When the user opens it, StackDoctor instantly forwards them with an HTTP 307 temporary redirect to the live Cloudflare tunnel on your phone. If your phone reboots and gets a new tunnel address, the gateway automatically updates the destination. Your clients never see broken links!
                </div>
              </div>

              {/* Routes List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {routes.map((route) => {
                  const isEditing = editingProjectId === route.project_id;
                  const isRunning = route.status === 'RUNNING';
                  const permUrl = `${originUrl}/live/${route.slug}`;

                  return (
                    <div
                      key={route.slug}
                      style={{
                        background: 'rgba(15, 23, 42, 0.65)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '14px',
                        padding: '16px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                      }}
                    >
                      {/* Top: App Info & Status */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontWeight: 700, fontSize: '1rem', color: '#f8fafc' }}>
                            {route.project_name || route.slug}
                          </span>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--accent-cyan)',
                              background: 'rgba(6, 182, 212, 0.12)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              border: '1px solid rgba(6, 182, 212, 0.25)'
                            }}
                          >
                            Port :{route.port}
                          </span>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                            {route.framework}
                          </span>
                        </div>

                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: isRunning ? '#34d399' : '#f87171',
                            background: isRunning ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            padding: '3px 8px',
                            borderRadius: '10px',
                            border: isRunning ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)'
                          }}
                        >
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              backgroundColor: isRunning ? '#10b981' : '#ef4444',
                              boxShadow: isRunning ? '0 0 6px #10b981' : 'none'
                            }}
                          />
                          {isRunning ? 'TUNNEL ACTIVE' : 'STOPPED'}
                        </span>
                      </div>

                      {/* Middle: Permanent Slug & Actions */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          background: 'rgba(5, 8, 20, 0.8)',
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: '1px solid rgba(56, 189, 248, 0.2)',
                          flexWrap: 'wrap'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
                          <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                            PERMANENT LINK:
                          </span>
                          {isEditing ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                              <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                                /live/
                              </span>
                              <input
                                type="text"
                                value={customSlugInput}
                                onChange={(e) => setCustomSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, ''))}
                                placeholder="custom-slug"
                                style={{
                                  background: 'rgba(15, 23, 42, 0.9)',
                                  border: '1px solid #38bdf8',
                                  borderRadius: '6px',
                                  padding: '4px 8px',
                                  color: '#38bdf8',
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '0.84rem',
                                  outline: 'none',
                                  width: '140px'
                                }}
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveSlug(route.project_id)}
                                disabled={updatingSlug || !customSlugInput.trim()}
                                style={{
                                  background: '#0284c7',
                                  border: 'none',
                                  color: '#fff',
                                  borderRadius: '6px',
                                  padding: '5px 10px',
                                  fontSize: '0.74rem',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                {updatingSlug ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={() => setEditingProjectId(null)}
                                style={{
                                  background: 'rgba(255, 255, 255, 0.1)',
                                  border: 'none',
                                  color: 'var(--text-secondary)',
                                  borderRadius: '6px',
                                  padding: '5px 8px',
                                  fontSize: '0.74rem',
                                  cursor: 'pointer'
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.88rem',
                                fontWeight: 700,
                                color: '#38bdf8'
                              }}
                            >
                              /live/{route.slug}
                            </span>
                          )}
                        </div>

                        {/* Button Suite */}
                        {!isEditing && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              onClick={() => {
                                setEditingProjectId(route.project_id);
                                setCustomSlugInput(route.slug);
                              }}
                              style={{
                                background: 'rgba(255, 255, 255, 0.06)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                color: '#cbd5e1',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '0.74rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              title="Customize permanent slug name"
                            >
                              ✏️ Edit Slug
                            </button>

                            <button
                              onClick={() => handleCopyLink(route.slug, permUrl)}
                              style={{
                                background: copiedSlug === route.slug
                                  ? 'rgba(16, 185, 129, 0.25)'
                                  : 'rgba(56, 189, 248, 0.12)',
                                border: copiedSlug === route.slug
                                  ? '1px solid rgba(16, 185, 129, 0.5)'
                                  : '1px solid rgba(56, 189, 248, 0.35)',
                                color: copiedSlug === route.slug ? '#34d399' : '#38bdf8',
                                padding: '5px 12px',
                                borderRadius: '6px',
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              {copiedSlug === route.slug ? '✔ Copied Link' : '📋 Copy Permanent Link'}
                            </button>

                            <a
                              href={`/live/${route.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                background: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                color: '#f8fafc',
                                padding: '5px 10px',
                                borderRadius: '6px',
                                fontSize: '0.74rem',
                                fontWeight: 600,
                                textDecoration: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="Test permanent redirect in new tab"
                            >
                              ↗ Test
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Bottom: Current Dynamic Target (Cloudflare URL) */}
                      <div
                        style={{
                          fontSize: '0.74rem',
                          color: 'var(--text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontFamily: 'var(--font-mono)'
                        }}
                      >
                        <span>Current Target:</span>
                        <span style={{ color: isRunning ? '#94a3b8' : '#64748b' }}>
                          {route.target_url || 'No active tunnel detected'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : activeTab === 'worker' ? (
            <div>
              {/* Cloudflare Worker guide */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.05) 100%)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '14px',
                  padding: '18px 20px',
                  marginBottom: '20px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '1.2rem' }}>🌍</span>
                  <h4 style={{ margin: 0, color: '#fbbf24', fontSize: '0.96rem', fontWeight: 700 }}>
                    100% Free Global Edge Gateway (No Custom Domain Required)
                  </h4>
                </div>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#e2e8f0', lineHeight: 1.5 }}>
                  Want a global URL like{' '}
                  <code style={{ color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                    https://my-phone-apps.workers.dev/live/swiftride
                  </code>{' '}
                  accessible by anyone worldwide? Cloudflare provides free subdomains with 100,000 requests/day for $0.
                </p>
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleCopyWorker}
                    style={{
                      background: copiedWorker ? '#10b981' : '#f59e0b',
                      color: '#000',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '7px 16px',
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {copiedWorker ? '✔ Worker Script Copied!' : '📋 Copy Worker Script (1-Click)'}
                  </button>
                  <a
                    href="https://dash.cloudflare.com"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: '#fff',
                      border: '1px solid rgba(255, 255, 255, 0.18)',
                      borderRadius: '8px',
                      padding: '7px 14px',
                      fontWeight: 600,
                      fontSize: '0.78rem',
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    Open Cloudflare Dashboard ↗
                  </a>
                </div>
              </div>

              {/* 3 Step instructions */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '12px',
                  marginBottom: '20px'
                }}
              >
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '0.82rem', marginBottom: '4px' }}>Step 1</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Go to <strong>dash.cloudflare.com</strong> &gt; <strong>Workers &amp; Pages</strong> &gt; <strong>Create Application</strong>.
                  </div>
                </div>
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '0.82rem', marginBottom: '4px' }}>Step 2</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Click <strong>Create Worker</strong>, name it (e.g. <code>my-gateway</code>), then click <strong>Deploy</strong>.
                  </div>
                </div>
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '0.82rem', marginBottom: '4px' }}>Step 3</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Click <strong>Edit Code</strong>, paste the script below, and click <strong>Deploy</strong>. Done!
                  </div>
                </div>
              </div>

              {/* Worker Code Viewer */}
              <div
                style={{
                  background: '#090d16',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    padding: '8px 16px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span style={{ fontSize: '0.74rem', fontFamily: 'var(--font-mono)', color: '#94a3b8' }}>
                    worker.js (Cloudflare ES Module)
                  </span>
                  <button
                    onClick={handleCopyWorker}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: copiedWorker ? '#34d399' : '#38bdf8',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {copiedWorker ? '✔ Copied' : 'Copy Code'}
                  </button>
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: '16px',
                    fontSize: '0.76rem',
                    fontFamily: 'var(--font-mono)',
                    color: '#e2e8f0',
                    lineHeight: 1.45,
                    maxHeight: '260px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {workerScript || '// Generating script...'}
                </pre>
              </div>
            </div>
          ) : (
            <div>
              {/* Architecture & Self-healing explainer */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    borderRadius: '14px',
                    padding: '20px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>⚡</span>
                    <h4 style={{ margin: 0, color: '#34d399', fontSize: '0.96rem', fontWeight: 700 }}>
                      Zero-Loss Edge Self-Healing Protocol
                    </h4>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.55 }}>
                    When you run apps on an Android phone, three events can cause URLs to change:
                  </p>
                  <ul style={{ margin: '10px 0 0 0', paddingLeft: '20px', fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.6 }}>
                    <li><strong>Phone Reboot:</strong> Termux shuts down and restarts upon device boot.</li>
                    <li><strong>Wi-Fi Reconnection:</strong> The phone switches networks or briefly loses Wi-Fi signal.</li>
                    <li><strong>Tunnel Timeout:</strong> Cloudflare Quick Tunnels terminate and must be re-spawned with a new random hostname.</li>
                  </ul>
                </div>

                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    borderRadius: '14px',
                    padding: '20px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>🛡️</span>
                    <h4 style={{ margin: 0, color: '#38bdf8', fontSize: '0.96rem', fontWeight: 700 }}>
                      How StackDoctor Solves It Automatically
                    </h4>
                  </div>
                  <ol style={{ margin: '10px 0 0 0', paddingLeft: '20px', fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.6 }}>
                    <li>
                      <strong>Termux Auto-Heal Daemon:</strong> On phone boot, <code>~/.bashrc</code> triggers <code>auto_heal_edge.sh</code>, immediately reviving MariaDB and all app daemons in native ARM64 without requiring the PC.
                    </li>
                    <li>
                      <strong>Watchdog Tunnel Relinking:</strong> StackDoctor's 24/7 Watchdog monitors port health and launches fresh Cloudflare tunnels whenever needed.
                    </li>
                    <li>
                      <strong>Gateway Route Synchronization:</strong> As soon as a new tunnel URL is provisioned, <code>GatewayManager</code> updates <code>routes.json</code> in milliseconds.
                    </li>
                    <li>
                      <strong>Permanent 307 Forwarding:</strong> Anyone visiting <code style={{ color: '#38bdf8' }}>/live/swiftride</code> is seamlessly forwarded to the new target. No links ever break!
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 28px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'rgba(5, 8, 20, 0.6)'
          }}
        >
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            StackDoctor Permanent Dynamic Edge Gateway • Zero DNS Downtime
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'linear-gradient(135deg, #0284c7, #0369a1)',
              border: 'none',
              color: '#fff',
              padding: '8px 18px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
