import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Wrench,
  Rocket,
  ChevronDown,
  ChevronUp,
  Server,
  Database,
  Layers,
  HardDrive,
  Code2,
} from 'lucide-react';
import { DiagnosticReport } from '../api';
import { ScoreGauge } from './ScoreGauge';
import { MySQLConfigPanel, MySQLConfig } from './MySQLConfigPanel';
import { EnvironmentVariablesEditor } from './EnvironmentVariablesEditor';

interface DoctorScorecardProps {
  report: DiagnosticReport;
  projectId: string;
  onApplyFixes: () => void;
  onDeploy: (target: 'phone' | 'local', dbConfig: MySQLConfig, envVars?: Record<string, string>) => void;
  isFixing: boolean;
  isDeploying: boolean;
}

export const DoctorScorecard: React.FC<DoctorScorecardProps> = ({
  report,
  projectId,
  onApplyFixes,
  onDeploy,
  isFixing,
  isDeploying,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'ISSUES' | 'PASSED'>('ALL');
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);
  const [target, setTarget] = useState<'phone' | 'local'>('phone');
  const [dbConfig, setDbConfig] = useState<MySQLConfig>({
    db_name: '',
    db_user: 'root',
    db_password: '',
    run_seeder: false,
    seeder_class: 'DatabaseSeeder',
  });
  const [customEnv, setCustomEnv] = useState<Record<string, string>>(report.metadata.detected_env || {});

  const meta = report.metadata;
  const isFullStackMern = meta.stack === 'node' && report.checks.some(c => c.id === 'node_fullstack_ui_bridge');
  const checks = report.checks.filter((c) => {
    if (filter === 'ISSUES') return c.status !== 'PASSED';
    if (filter === 'PASSED') return c.status === 'PASSED';
    return true;
  });

  const toggleExpand = (id: string) => {
    setExpandedCheckId(expandedCheckId === id ? null : id);
  };

  const canDeploy = report.failed_count === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Architecture Metadata Grid */}
      <div
        className="glass-card"
        style={{
          padding: '20px 24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '16px',
        }}
      >
        {meta.stack === 'node' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  background: isFullStackMern ? 'rgba(16, 185, 129, 0.15)' : 'rgba(6, 182, 212, 0.15)',
                  border: isFullStackMern ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(6, 182, 212, 0.3)',
                  color: isFullStackMern ? '#34d399' : '#38bdf8',
                }}
              >
                <Server size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: isFullStackMern ? '#34d399' : 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>
                  {isFullStackMern ? 'STACK ARCHITECTURE' : 'FRAMEWORK'}
                </div>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#f8fafc' }}>
                  {isFullStackMern ? '⚛️ FULL-STACK MERN' : `⚡ ${meta.framework}`}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  color: '#60a5fa',
                }}
              >
                <Code2 size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>NODE RUNTIME</div>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#f8fafc' }}>Node.js v24 LTS (ARM64)</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  color: '#fbbf24',
                }}
              >
                <Layers size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>ENTRYPOINT</div>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                  {meta.detected_entrypoint || 'server.js'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#34d399',
                }}
              >
                <Database size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>DATABASE</div>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#f8fafc' }}>{meta.db_connection.toUpperCase()}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  background: 'rgba(6, 182, 212, 0.15)',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                  color: '#38bdf8',
                }}
              >
                <HardDrive size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>SERVER DRIVER</div>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#f8fafc' }}>
                  {isFullStackMern ? 'Express + React SPA Bridge' : 'Node Engine / 24/7 Tunnel'}
                </div>
              </div>
            </div>
          </>
        ) : meta.stack === 'python' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#34d399',
                }}
              >
                <Server size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>FRAMEWORK</div>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#f8fafc' }}>🐍 {meta.framework}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  color: '#60a5fa',
                }}
              >
                <Code2 size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>PYTHON RUNTIME</div>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#f8fafc' }}>Python 3.13 (ARM64)</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  background: 'rgba(139, 92, 246, 0.15)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  color: '#c084fc',
                }}
              >
                <Layers size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>ENTRYPOINT</div>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                  {meta.detected_entrypoint || 'main.py'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#34d399',
                }}
              >
                <Database size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>DATABASE</div>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#f8fafc' }}>{meta.db_connection.toUpperCase()} (Zero-Config)</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  background: 'rgba(6, 182, 212, 0.15)',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                  color: '#38bdf8',
                }}
              >
                <HardDrive size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>SERVER DRIVER</div>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#f8fafc' }}>Uvicorn ASGI / 24/7 Tunnel</div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                }}
              >
                <Server size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>FRAMEWORK</div>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#f8fafc' }}>🐘 Laravel {meta.framework_version || '11.x'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  color: '#60a5fa',
                }}
              >
                <Code2 size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>PHP RUNTIME</div>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#f8fafc' }}>PHP {meta.resolved_php_version}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#34d399',
                }}
              >
                <Database size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>DATABASE</div>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#f8fafc' }}>{meta.db_connection.toUpperCase()}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  color: '#fbbf24',
                }}
              >
                <Layers size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>ASSETS</div>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#f8fafc' }}>{meta.asset_bundler ? meta.asset_bundler.toUpperCase() : 'None'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  background: 'rgba(6, 182, 212, 0.15)',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                  color: '#38bdf8',
                }}
              >
                <HardDrive size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>STORAGE</div>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#f8fafc' }}>{meta.has_storage_link ? 'Linked' : 'Missing Link'}</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Main Scorecard & Diagnostics Split */}
      <div style={{ display: 'grid', gridTemplateColumns: '330px 1fr', gap: '24px', alignItems: 'start' }}>
        {/* Left Column: Health Score Card & Actions */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <ScoreGauge score={report.readiness_score} size={175} />

          <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.55 }}>
            {report.summary}
          </p>

          {/* Stats Badges */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center' }}>
            <div
              style={{
                padding: '10px 8px',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '8px',
              }}
            >
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#34d399' }}>{report.passed_count}</div>
              <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 600 }}>PASSED</div>
            </div>
            <div
              style={{
                padding: '10px 8px',
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: '8px',
              }}
            >
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fbbf24' }}>{report.warning_count}</div>
              <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 600 }}>WARNINGS</div>
            </div>
            <div
              style={{
                padding: '10px 8px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '8px',
              }}
            >
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f87171' }}>{report.failed_count}</div>
              <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 600 }}>CRITICAL</div>
            </div>
          </div>

          {/* Deployment Destination Selector */}
          <div
            style={{
              background: 'rgba(5, 8, 20, 0.65)',
              borderRadius: '12px',
              padding: '14px',
              marginTop: '4px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                fontWeight: 700,
                letterSpacing: '0.6px',
                marginBottom: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>TARGET DESTINATION</span>
              <span
                style={{
                  fontSize: '0.68rem',
                  color: target === 'phone' ? '#34d399' : '#60a5fa',
                  background: target === 'phone' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(96, 165, 250, 0.15)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  border: target === 'phone' ? '1px solid rgba(52, 211, 153, 0.3)' : '1px solid rgba(96, 165, 250, 0.3)',
                }}
              >
                {target === 'phone' ? '24/7 ONLINE' : 'LOCAL HOST'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setTarget('phone')}
                style={{
                  padding: '12px 10px',
                  borderRadius: '9px',
                  border: target === 'phone' ? '1.5px solid var(--accent-emerald)' : '1px solid rgba(255, 255, 255, 0.08)',
                  background:
                    target === 'phone'
                      ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.22), rgba(6, 78, 59, 0.4))'
                      : 'rgba(10, 15, 28, 0.6)',
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxShadow: target === 'phone' ? '0 0 16px rgba(16, 185, 129, 0.25)' : 'none',
                }}
              >
                <div style={{ fontSize: '0.84rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span>📱 Phone Cloud</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: target === 'phone' ? '#6ee7b7' : 'var(--text-muted)', marginTop: '2px' }}>
                  {meta.stack === 'node' ? 'Node v24 + HTTPS' : meta.stack === 'python' ? 'Python 3.13 + HTTPS' : 'MariaDB + HTTPS'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTarget('local')}
                style={{
                  padding: '12px 10px',
                  borderRadius: '9px',
                  border: target === 'local' ? '1.5px solid var(--accent-cyan)' : '1px solid rgba(255, 255, 255, 0.08)',
                  background:
                    target === 'local'
                      ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.22), rgba(8, 47, 73, 0.4))'
                      : 'rgba(10, 15, 28, 0.6)',
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxShadow: target === 'local' ? '0 0 16px rgba(6, 182, 212, 0.25)' : 'none',
                }}
              >
                <div style={{ fontSize: '0.84rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span>💻 Local PC</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: target === 'local' ? '#7dd3fc' : 'var(--text-muted)', marginTop: '2px' }}>
                  Local Port 808x
                </div>
              </button>
            </div>
          </div>

          {/* MySQL Database Configuration Panel (Laravel only) */}
          {target === 'phone' && meta.stack === 'php' && (
            <div style={{ marginTop: '4px' }}>
              <MySQLConfigPanel
                projectId={projectId}
                config={dbConfig}
                onChange={setDbConfig}
              />
            </div>
          )}

          {/* Interactive Pre-Deploy Environment Variables & Secrets Panel */}
          <div style={{ marginTop: '8px' }}>
            <EnvironmentVariablesEditor
              initialEnv={report.metadata.detected_env}
              stack={meta.stack}
              onChange={setCustomEnv}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
            {report.auto_fixable_count > 0 && (
              <button
                onClick={onApplyFixes}
                disabled={isFixing}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  padding: '13px',
                  borderRadius: '10px',
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <Wrench size={18} />
                {isFixing ? 'Applying Auto-Fixes...' : `Auto-Repair (${report.auto_fixable_count} Issues)`}
              </button>
            )}

            <button
              onClick={() => onDeploy(target, dbConfig, customEnv)}
              disabled={isDeploying || !canDeploy}
              className={`btn ${canDeploy ? 'btn-success' : 'btn-outline'}`}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: '10px',
                fontSize: '0.92rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: canDeploy ? '0 4px 18px rgba(16, 185, 129, 0.35)' : 'none',
              }}
            >
              <Rocket size={18} />
              {isDeploying
                ? 'Deploying to Cluster...'
                : canDeploy
                ? target === 'phone'
                  ? '🚀 Deploy 24/7 to Phone Cloud'
                  : '🚀 Deploy to Local PC'
                : 'Resolve Blockers to Deploy'}
            </button>
          </div>
        </div>

        {/* Right Column: Detailed Diagnostic Checklist */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontWeight: 700 }}>
              <span>Diagnostic Checklist</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                ({checks.length} items evaluated)
              </span>
            </h2>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setFilter('ALL')}
                className={`btn ${filter === 'ALL' ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '6px 14px', fontSize: '0.76rem', borderRadius: '7px' }}
              >
                All
              </button>
              <button
                onClick={() => setFilter('ISSUES')}
                className={`btn ${filter === 'ISSUES' ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '6px 14px', fontSize: '0.76rem', borderRadius: '7px' }}
              >
                Issues ({report.failed_count + report.warning_count})
              </button>
              <button
                onClick={() => setFilter('PASSED')}
                className={`btn ${filter === 'PASSED' ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '6px 14px', fontSize: '0.76rem', borderRadius: '7px' }}
              >
                Passed ({report.passed_count})
              </button>
            </div>
          </div>

          {/* List of Checks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {checks.map((check) => {
              const isExpanded = expandedCheckId === check.id;

              let icon = <CheckCircle2 size={18} color="#34d399" />;
              let badgeClass = 'badge-pass';
              if (check.status === 'WARNING') {
                icon = <AlertTriangle size={18} color="#fbbf24" />;
                badgeClass = 'badge-warn';
              } else if (check.status === 'FAILED') {
                icon = <XCircle size={18} color="#f87171" />;
                badgeClass = 'badge-fail';
              }

              return (
                <div
                  key={check.id}
                  onClick={() => toggleExpand(check.id)}
                  style={{
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    background: isExpanded ? 'rgba(15, 23, 42, 0.85)' : 'rgba(10, 15, 28, 0.6)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isExpanded ? '0 4px 16px rgba(0, 0, 0, 0.3)' : 'none',
                  }}
                >
                  <div
                    style={{
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {icon}
                      <div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#f8fafc' }}>{check.title}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          {check.category} • {check.name}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {check.auto_fixable && check.status !== 'PASSED' && (
                        <span className="badge badge-info" style={{ fontSize: '0.68rem', padding: '3px 8px' }}>
                          ⚡ Auto-Fix
                        </span>
                      )}
                      <span className={`badge ${badgeClass}`}>{check.status}</span>
                      {isExpanded ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div
                      style={{
                        padding: '0 18px 16px 48px',
                        fontSize: '0.85rem',
                        lineHeight: 1.6,
                        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                        marginTop: '4px',
                        paddingTop: '12px',
                      }}
                    >
                      <div style={{ marginBottom: '8px' }}>
                        <strong style={{ color: 'var(--text-secondary)' }}>Why this matters:</strong>{' '}
                        <span style={{ color: '#cbd5e1' }}>{check.explanation}</span>
                      </div>
                      <div>
                        <strong style={{ color: 'var(--text-secondary)' }}>How to fix:</strong>{' '}
                        <span style={{ color: '#34d399' }}>{check.remediation}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
