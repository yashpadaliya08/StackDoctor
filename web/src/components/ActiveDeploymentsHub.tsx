import React, { useState, useEffect } from 'react';
import { DeploymentRecord, GatewayRoute, fetchGatewayRoutes, stopProjectDeployment, restartProjectDeployment, deleteProjectDeployment } from '../api';
import { DeploymentLogsModal } from './DeploymentLogsModal';
import { DeploymentTerminalExecModal } from './DeploymentTerminalExecModal';
import { DeploymentDatabaseModal } from './DeploymentDatabaseModal';
import { DeploymentEnvModal } from './DeploymentEnvModal';
import { WatchdogStatusModal } from './WatchdogStatusModal';
import { DeploymentGitModal } from './DeploymentGitModal';
import { DeploymentDomainsModal } from './DeploymentDomainsModal';
import { DeploymentAnalyticsModal } from './DeploymentAnalyticsModal';
import { SecurityAuditModal } from './SecurityAuditModal';
import { DeploymentGatewayModal } from './DeploymentGatewayModal';

interface Props {
  deployments: DeploymentRecord[];
  onRefresh: () => void;
}

export const ActiveDeploymentsHub: React.FC<Props> = ({ deployments, onRefresh }) => {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activeLogsDep, setActiveLogsDep] = useState<DeploymentRecord | null>(null);
  const [activeTerminalDep, setActiveTerminalDep] = useState<DeploymentRecord | null>(null);
  const [activeDbDep, setActiveDbDep] = useState<DeploymentRecord | null>(null);
  const [activeEnvDep, setActiveEnvDep] = useState<DeploymentRecord | null>(null);
  const [activeGitDep, setActiveGitDep] = useState<DeploymentRecord | null>(null);
  const [activeDomainsDep, setActiveDomainsDep] = useState<DeploymentRecord | null>(null);
  const [activeAnalyticsDep, setActiveAnalyticsDep] = useState<DeploymentRecord | null>(null);
  const [showWatchdogModal, setShowWatchdogModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [selectedGatewayProjectId, setSelectedGatewayProjectId] = useState<string | null>(null);
  const [gatewayRoutes, setGatewayRoutes] = useState<GatewayRoute[]>([]);

  useEffect(() => {
    loadGatewayRoutes();
  }, [deployments]);

  const loadGatewayRoutes = async () => {
    try {
      const res = await fetchGatewayRoutes();
      setGatewayRoutes(res.routes || []);
    } catch (e) {
      console.error('Failed to load gateway routes in hub:', e);
    }
  };

  if (!deployments || deployments.length === 0) {
    return null;
  }

  const handleCopy = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleStop = async (projectId: string) => {
    setActionLoading(projectId);
    try {
      await stopProjectDeployment(projectId);
      onRefresh();
    } catch (e: any) {
      console.error('Stop error:', e);
      onRefresh();
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestart = async (projectId: string) => {
    setActionLoading(projectId);
    try {
      await restartProjectDeployment(projectId);
      onRefresh();
    } catch (e: any) {
      console.error('Restart error:', e);
      onRefresh();
    } finally {
      setActionLoading(null);
    }
  };

  const executeDelete = async (identifier: string) => {
    setActionLoading(identifier);
    setConfirmDeleteId(null);
    try {
      await deleteProjectDeployment(identifier);
      onRefresh();
    } catch (e: any) {
      console.error('Delete error:', e);
      onRefresh();
    } finally {
      setActionLoading(null);
    }
  };

  const getFrameworkBadge = (framework: string) => {
    const f = framework.toLowerCase();
    if (f.includes('laravel') || f.includes('php')) {
      return { label: '🐘 Laravel (PHP 8.3)', icon: '🐘' };
    }
    if (f.includes('fastapi')) {
      return { label: '🐍 FastAPI (Python 3.13)', icon: '🐍' };
    }
    if (f.includes('django')) {
      return { label: '🐍 Django (Python 3.13)', icon: '🐍' };
    }
    if (f.includes('flask')) {
      return { label: '🐍 Flask (Python 3.13)', icon: '🐍' };
    }
    if (f.includes('node') || f.includes('express') || f.includes('mern')) {
      return { label: '⚡ Node.js Express (MERN)', icon: '⚡' };
    }
    return { label: `📦 ${framework}`, icon: '📦' };
  };

  const runningCount = deployments.filter((d) => d.status === 'RUNNING' || d.status === 'COMPLETED').length;

  return (
    <>
      <div
        className="glass-card"
        style={{
          padding: '24px',
          marginBottom: '28px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Ambient background glow */}
        <div
        style={{
          position: 'absolute',
          top: '-40px',
          left: '20%',
          width: '320px',
          height: '180px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          marginBottom: '22px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
          paddingBottom: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.25rem' }}>🚀</span>
            <h3
              style={{
                margin: 0,
                fontSize: '1.2rem',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span>Active Deployments Hub</span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '12px',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  boxShadow: '0 0 12px rgba(16, 185, 129, 0.2)',
                  letterSpacing: '0.04em',
                }}
              >
                <span className="pulse-indicator" style={{ width: '6px', height: '6px' }}>
                  <span className="pulse-ring" style={{ borderColor: '#10b981' }} />
                  <span className="pulse-dot" style={{ background: '#10b981' }} />
                </span>
                {runningCount} ACTIVE ON PHONE
              </span>
            </h3>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
            High-availability microservices and web apps hosted locally on ARM64 Termux with auto-provisioned HTTPS edge tunnels.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              setSelectedGatewayProjectId(null);
              setShowGatewayModal(true);
            }}
            style={{
              background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.22), rgba(3, 105, 161, 0.15))',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              color: '#38bdf8',
              padding: '7px 14px',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
              boxShadow: '0 2px 10px rgba(56, 189, 248, 0.2)',
            }}
            title="Manage permanent dynamic redirect slugs and Cloudflare worker edge gateway"
          >
            <span>🌐</span> Permanent Gateway
          </button>

          <button
            onClick={() => setShowAuditModal(true)}
            style={{
              background: 'linear-gradient(135deg, rgba(225, 29, 72, 0.18), rgba(159, 18, 57, 0.12))',
              border: '1px solid rgba(225, 29, 72, 0.35)',
              color: '#fda4af',
              padding: '7px 14px',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
              boxShadow: '0 2px 8px rgba(225, 29, 72, 0.15)',
            }}
            title="Inspect security audit logs & DDoS rate limiting"
          >
            <span>🛡️</span> Security &amp; Audit
          </button>

          <button
            onClick={() => setShowWatchdogModal(true)}
            style={{
              background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.18), rgba(15, 118, 110, 0.12))',
              border: '1px solid rgba(13, 148, 136, 0.35)',
              color: '#5eead4',
              padding: '7px 14px',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
              boxShadow: '0 2px 8px rgba(13, 148, 136, 0.15)',
            }}
            title="View 24/7 Watchdog self-healer status and history"
          >
            <span>⚡</span> 24/7 Watchdog
          </button>

          <button
            onClick={onRefresh}
            className="btn btn-outline"
            style={{
              padding: '7px 14px',
              fontSize: '0.78rem',
              fontWeight: 600,
            }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Deployments Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
          gap: '18px',
        }}
      >
        {deployments.map((dep) => {
          const isRunning = dep.status === 'RUNNING' || dep.status === 'COMPLETED';
          const fw = getFrameworkBadge(dep.framework);
          const isLoading = actionLoading === dep.project_id;

          return (
            <div
              key={dep.project_id}
              className="glass-card-interactive"
              style={{
                borderRadius: '14px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.7) 0%, rgba(10, 15, 28, 0.85) 100%)',
                border: isRunning ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: isRunning
                  ? '0 8px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(16, 185, 129, 0.2)'
                  : '0 8px 20px rgba(0, 0, 0, 0.35)',
                position: 'relative',
              }}
            >
              <div>
                {/* Top Row: Framework Badge & Status Aura */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span
                    style={{
                      backgroundColor: 'rgba(5, 8, 20, 0.6)',
                      color: fw.label.includes('Laravel')
                        ? '#fca5a5'
                        : fw.label.includes('Python') || fw.label.includes('FastAPI')
                        ? '#6ee7b7'
                        : '#7dd3fc',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: '6px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {fw.label}
                  </span>

                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      color: isRunning ? '#34d399' : '#f87171',
                      background: isRunning ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      padding: '3px 8px',
                      borderRadius: '12px',
                      border: isRunning ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
                    }}
                  >
                    <span
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        backgroundColor: isRunning ? '#10b981' : '#ef4444',
                        boxShadow: isRunning ? '0 0 8px #10b981' : 'none',
                      }}
                    />
                    {isRunning ? 'LIVE 24/7' : 'STOPPED'}
                  </span>
                </div>

                {/* Project Name & Port */}
                <div style={{ marginBottom: '12px' }}>
                  <div
                    style={{
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      color: '#f8fafc',
                      wordBreak: 'break-all',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {dep.project_name || dep.project_id}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--accent-cyan)',
                        background: 'rgba(6, 182, 212, 0.1)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        border: '1px solid rgba(6, 182, 212, 0.25)',
                      }}
                    >
                      Port :{dep.port}
                    </span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      ID: {dep.project_id.slice(0, 10)}
                    </span>
                  </div>
                </div>

                {/* Permanent Gateway Link Box (Reboot-proof) */}
                {(() => {
                  const gwRoute = gatewayRoutes.find((r) => r.project_id === dep.project_id);
                  const slug = gwRoute?.slug || dep.project_name.toLowerCase().replace(/[^a-z0-9]/g, '') || dep.project_id.slice(0, 8);
                  const permUrl = `${window.location.origin}/live/${slug}`;

                  return (
                    <div
                      style={{
                        backgroundColor: 'rgba(2, 132, 199, 0.12)',
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        marginBottom: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        <span style={{ fontSize: '0.68rem', color: '#38bdf8', fontWeight: 800, flexShrink: 0, letterSpacing: '0.04em' }}>
                          🔗 PERMANENT:
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.8rem',
                            color: '#f0f9ff',
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          /live/{slug}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                        <button
                          onClick={() => handleCopy(dep.project_id + '_perm', permUrl)}
                          style={{
                            background: copiedId === dep.project_id + '_perm' ? '#10b981' : 'rgba(56, 189, 248, 0.2)',
                            border: '1px solid rgba(56, 189, 248, 0.4)',
                            color: copiedId === dep.project_id + '_perm' ? '#fff' : '#38bdf8',
                            padding: '3px 8px',
                            borderRadius: '5px',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          title="Copy permanent redirect link (never breaks across phone reboots)"
                        >
                          {copiedId === dep.project_id + '_perm' ? '✔ Copied' : 'Copy'}
                        </button>
                        <button
                          onClick={() => {
                            setSelectedGatewayProjectId(dep.project_id);
                            setShowGatewayModal(true);
                          }}
                          style={{
                            background: 'rgba(255, 255, 255, 0.06)',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            color: '#94a3b8',
                            borderRadius: '5px',
                            padding: '3px 6px',
                            fontSize: '0.68rem',
                            cursor: 'pointer',
                          }}
                          title="Customize permanent slug"
                        >
                          ✏️
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Raw Ephemeral Tunnel URL Box */}
                {dep.live_url && (
                  <div
                    style={{
                      backgroundColor: 'rgba(5, 8, 20, 0.7)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '0.74rem',
                      fontFamily: 'var(--font-mono)',
                      color: isRunning ? '#94a3b8' : 'var(--text-muted)',
                      marginBottom: '14px',
                      wordBreak: 'break-all',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="Raw ephemeral Cloudflare tunnel">
                      {dep.live_url}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', flexShrink: 0 }}>EPHEMERAL</span>
                  </div>
                )}

                {/* Management Suite Toolbar - Row 1 */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '6px',
                    marginBottom: '6px',
                  }}
                >
                  <button
                    onClick={() => setActiveLogsDep(dep)}
                    className="btn-tool"
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#93c5fd',
                      padding: '7px 4px',
                      borderRadius: '6px',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      transition: 'all 0.15s',
                    }}
                    title="Stream live stdout and application logs"
                  >
                    📜 Logs
                  </button>

                  <button
                    onClick={() => setActiveTerminalDep(dep)}
                    className="btn-tool"
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#fcd34d',
                      padding: '7px 4px',
                      borderRadius: '6px',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      transition: 'all 0.15s',
                    }}
                    title="Execute artisan / composer / npm / python commands"
                  >
                    ⚡ Exec
                  </button>

                  <button
                    onClick={() => setActiveDbDep(dep)}
                    className="btn-tool"
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#c084fc',
                      padding: '7px 4px',
                      borderRadius: '6px',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      transition: 'all 0.15s',
                    }}
                    title="Inspect tables & execute SQL queries in MariaDB"
                  >
                    🗄️ SQL
                  </button>

                  <button
                    onClick={() => setActiveEnvDep(dep)}
                    className="btn-tool"
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#34d399',
                      padding: '7px 4px',
                      borderRadius: '6px',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      transition: 'all 0.15s',
                    }}
                    title="Manage environment variables & hot-restart"
                  >
                    🔐 .env
                  </button>
                </div>

                {/* DevOps & SaaS Tools Row - Row 2 */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '6px',
                    marginBottom: '12px',
                  }}
                >
                  <button
                    onClick={() => setActiveGitDep(dep)}
                    className="btn-tool"
                    style={{
                      background: 'rgba(2, 132, 199, 0.08)',
                      border: '1px solid rgba(2, 132, 199, 0.3)',
                      color: '#38bdf8',
                      padding: '7px 4px',
                      borderRadius: '6px',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      transition: 'all 0.15s',
                    }}
                    title="GitHub webhook push-to-deploy and 1-click rollbacks"
                  >
                    🔄 CI/CD
                  </button>

                  <button
                    onClick={() => {
                      setSelectedGatewayProjectId(dep.project_id);
                      setShowGatewayModal(true);
                    }}
                    className="btn-tool"
                    style={{
                      background: 'rgba(56, 189, 248, 0.08)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      color: '#38bdf8',
                      padding: '7px 4px',
                      borderRadius: '6px',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      transition: 'all 0.15s',
                    }}
                    title="Permanent dynamic redirect link & slug manager"
                  >
                    🔗 Gateway
                  </button>

                  <button
                    onClick={() => setActiveDomainsDep(dep)}
                    className="btn-tool"
                    style={{
                      background: 'rgba(5, 150, 105, 0.08)',
                      border: '1px solid rgba(5, 150, 105, 0.3)',
                      color: '#34d399',
                      padding: '7px 4px',
                      borderRadius: '6px',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      transition: 'all 0.15s',
                    }}
                    title="Custom domains & edge SSL provisioning"
                  >
                    🌐 Domains
                  </button>

                  <button
                    onClick={() => setActiveAnalyticsDep(dep)}
                    className="btn-tool"
                    style={{
                      background: 'rgba(126, 34, 206, 0.08)',
                      border: '1px solid rgba(126, 34, 206, 0.3)',
                      color: '#c084fc',
                      padding: '7px 4px',
                      borderRadius: '6px',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      transition: 'all 0.15s',
                    }}
                    title="Real-time APM traffic analytics & Discord alerts"
                  >
                    📊 APM
                  </button>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  paddingTop: '12px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  marginTop: '6px',
                  flexWrap: 'wrap',
                }}
              >
                {isRunning && dep.live_url && (
                  <a
                    href={dep.live_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#ffffff',
                      padding: '7px 12px',
                      borderRadius: '7px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)',
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    🚀 Open Site
                  </a>
                )}

                {dep.live_url && (
                  <button
                    onClick={() => handleCopy(dep.project_id, dep.live_url!)}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.07)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#cbd5e1',
                      padding: '7px 10px',
                      borderRadius: '7px',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {copiedId === dep.project_id ? '✔ Copied' : '📄 Copy'}
                  </button>
                )}

                {isRunning ? (
                  <>
                    <button
                      onClick={() => handleRestart(dep.project_id)}
                      disabled={isLoading}
                      style={{
                        backgroundColor: 'rgba(56, 189, 248, 0.12)',
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                        color: '#38bdf8',
                        padding: '7px 10px',
                        borderRadius: '7px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease',
                      }}
                      title="Re-sync phone server process & fetch new Cloudflare tunnel URL if disconnected"
                    >
                      {isLoading ? '...' : '🔄 Re-Sync'}
                    </button>

                    <button
                      onClick={() => handleStop(dep.project_id)}
                      disabled={isLoading}
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        color: '#fca5a5',
                        padding: '7px 10px',
                        borderRadius: '7px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isLoading ? '...' : '⏹ Stop'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleRestart(dep.project_id)}
                    disabled={isLoading}
                    style={{
                      backgroundColor: 'rgba(59, 130, 246, 0.12)',
                      border: '1px solid rgba(59, 130, 246, 0.35)',
                      color: '#bfdbfe',
                      padding: '7px 10px',
                      borderRadius: '7px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isLoading ? '...' : '🔄 Restart'}
                  </button>
                )}

                {confirmDeleteId === (dep.project_id || dep.deployment_id) ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                    <button
                      onClick={() => executeDelete(dep.project_id || dep.deployment_id)}
                      disabled={isLoading}
                      style={{
                        backgroundColor: '#dc2626',
                        border: '1px solid #ef4444',
                        color: '#ffffff',
                        padding: '6px 12px',
                        borderRadius: '7px',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        boxShadow: '0 0 14px rgba(220, 38, 38, 0.5)',
                      }}
                      title="Click to permanently delete this deployment"
                    >
                      {isLoading ? '⏳ Deleting...' : '⚠️ Confirm Delete?'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={isLoading}
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#9ca3af',
                        padding: '6px 8px',
                        borderRadius: '7px',
                        fontSize: '0.76rem',
                        cursor: 'pointer',
                      }}
                      title="Cancel"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(dep.project_id || dep.deployment_id)}
                    disabled={isLoading}
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      color: '#f87171',
                      padding: '7px 11px',
                      borderRadius: '7px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      marginLeft: 'auto',
                      transition: 'all 0.15s ease',
                    }}
                    title="Stop server, terminate tunnel, and remove deployment"
                  >
                    {isLoading ? '⏳ ...' : '🗑️ Delete'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>

    {/* Management Suite Modals - Mounted outside glass-card so backdrop-filter does not trap fixed modals */}
      {activeLogsDep && (
        <DeploymentLogsModal
          projectId={activeLogsDep.project_id}
          projectName={activeLogsDep.project_name}
          onClose={() => setActiveLogsDep(null)}
        />
      )}

      {activeTerminalDep && (
        <DeploymentTerminalExecModal
          projectId={activeTerminalDep.project_id}
          projectName={activeTerminalDep.project_name}
          onClose={() => setActiveTerminalDep(null)}
        />
      )}

      {activeDbDep && (
        <DeploymentDatabaseModal
          projectId={activeDbDep.project_id}
          projectName={activeDbDep.project_name}
          onClose={() => setActiveDbDep(null)}
        />
      )}

      {activeEnvDep && (
        <DeploymentEnvModal
          projectId={activeEnvDep.project_id}
          projectName={activeEnvDep.project_name}
          onClose={() => {
            setActiveEnvDep(null);
            onRefresh();
          }}
        />
      )}

      {showWatchdogModal && (
        <WatchdogStatusModal onClose={() => setShowWatchdogModal(false)} />
      )}

      {activeGitDep && (
        <DeploymentGitModal
          projectId={activeGitDep.project_id}
          projectName={activeGitDep.project_name}
          onClose={() => {
            setActiveGitDep(null);
            onRefresh();
          }}
        />
      )}

      {activeDomainsDep && (
        <DeploymentDomainsModal
          projectId={activeDomainsDep.project_id}
          projectName={activeDomainsDep.project_name}
          tunnelUrl={activeDomainsDep.live_url}
          onClose={() => setActiveDomainsDep(null)}
        />
      )}

      {activeAnalyticsDep && (
        <DeploymentAnalyticsModal
          projectId={activeAnalyticsDep.project_id}
          projectName={activeAnalyticsDep.project_name}
          liveUrl={activeAnalyticsDep.live_url}
          port={activeAnalyticsDep.port}
          onClose={() => setActiveAnalyticsDep(null)}
        />
      )}

      {showAuditModal && (
        <SecurityAuditModal onClose={() => setShowAuditModal(false)} />
      )}

      {showGatewayModal && (
        <DeploymentGatewayModal
          deployments={deployments}
          initialSelectedProjectId={selectedGatewayProjectId || undefined}
          onClose={() => {
            setShowGatewayModal(false);
            setSelectedGatewayProjectId(null);
          }}
          onRefresh={() => {
            loadGatewayRoutes();
            onRefresh();
          }}
        />
      )}
    </>
  );
};

