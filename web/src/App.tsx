import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { UploadZone } from './components/UploadZone';
import { DoctorScorecard } from './components/DoctorScorecard';
import { DeploymentTerminal } from './components/DeploymentTerminal';
import { ArchitectureMap } from './components/ArchitectureMap';
import { ActiveDeploymentsHub } from './components/ActiveDeploymentsHub';
import { PhoneHardwareMonitor } from './components/PhoneHardwareMonitor';
import {
  applyFixes,
  createDeployment,
  githubQuickDeploy,
  DeploymentLogEvent,
  DiagnosticReport,
  MySQLConfig,
  listenDeploymentStream,
  uploadAndAnalyze,
  analyzeGitRepo,
  fetchSampleProject,
  fetchActiveDeployment,
  DeploymentRecord,
  fetchPhoneCapabilities,
  PhoneCapabilities,
  deleteProjectDeployment,
} from './api';

export const App: React.FC = () => {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(null);
  const [subdomain, setSubdomain] = useState<string>('');
  const [deploymentEvents, setDeploymentEvents] = useState<DeploymentLogEvent[]>([]);
  const [isDeployComplete, setIsDeployComplete] = useState(false);
  const [liveUrl, setLiveUrl] = useState<string | undefined>(undefined);
  const [showArchitecture, setShowArchitecture] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [allDeployments, setAllDeployments] = useState<DeploymentRecord[]>([]);
  const [phoneCaps, setPhoneCaps] = useState<PhoneCapabilities | null>(null);

  const refreshDeployments = async () => {
    try {
      const data = await fetchActiveDeployment();
      if (data && data.deployments) {
        setAllDeployments(data.deployments);
      }
    } catch {
      // ignore
    }
  };

  // Poll for active deployment and phone capabilities on load and after deployment
  useEffect(() => {
    refreshDeployments();
    fetchPhoneCapabilities().then((caps) => {
      if (caps) setPhoneCaps(caps);
    });
  }, [isDeployComplete]);

  const handleFileUpload = async (file: File) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await uploadAndAnalyze(file);
      setProjectId(data.project_id);
      setReport(data.report);
      setSubdomain(`app-${data.project_id.slice(0, 6)}`);
      // Reset deployment state
      setActiveDeploymentId(null);
      setDeploymentEvents([]);
      setIsDeployComplete(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Analysis failed. Please check the project archive.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGitSubmit = async (url: string, branch?: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await analyzeGitRepo(url, branch);
      setProjectId(data.project_id);
      setReport(data.report);
      setSubdomain(`repo-${data.project_id.slice(0, 6)}`);
      setActiveDeploymentId(null);
      setDeploymentEvents([]);
      setIsDeployComplete(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to clone repository.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyFixes = async () => {
    if (!projectId) return;
    setIsFixing(true);
    setErrorMsg(null);
    try {
      const data = await applyFixes(projectId);
      setReport(data.updated_report);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to apply automated fixes.');
    } finally {
      setIsFixing(false);
    }
  };

  const handleDeploy = async (target: 'phone' | 'local' = 'phone', dbConfig?: MySQLConfig, envVars?: Record<string, string>) => {
    if (!projectId) return;
    setIsDeploying(true);
    setErrorMsg(null);
    setDeploymentEvents([]);
    setIsDeployComplete(false);

    try {
      const data = await createDeployment(projectId, subdomain, target, dbConfig, envVars);
      setActiveDeploymentId(data.deployment_id);

      // Start listening to SSE stream
      listenDeploymentStream(
        data.deployment_id,
        (evt) => {
          setDeploymentEvents((prev) => [...prev, evt]);
        },
        (completeData) => {
          setIsDeploying(false);
          if (completeData.status === 'COMPLETED' && completeData.live_url) {
            setIsDeployComplete(true);
            setLiveUrl(completeData.live_url);
          } else {
            setIsDeployComplete(false);
            setLiveUrl(undefined);
            setErrorMsg(completeData.message || 'Deployment failed on target server.');
          }
        },
        (err) => {
          console.error('SSE Error:', err);
          setIsDeploying(false);
        }
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Deployment failed to launch.');
      setIsDeploying(false);
    }
  };

  const handleQuickGitDeploy = async (url: string, branch: string | undefined, dbConfig: MySQLConfig) => {
    setIsLoading(true);
    setErrorMsg(null);
    setDeploymentEvents([]);
    setIsDeployComplete(false);
    setReport(null);

    try {
      const data = await githubQuickDeploy(url, branch, dbConfig, 'phone');
      setProjectId(data.project_id);
      setSubdomain(data.subdomain);
      setActiveDeploymentId(data.deployment_id);
      setIsLoading(false);
      setIsDeploying(true);

      // Start listening to SSE stream
      listenDeploymentStream(
        data.deployment_id,
        (evt) => {
          setDeploymentEvents((prev) => [...prev, evt]);
        },
        (completeData) => {
          setIsDeploying(false);
          if (completeData.status === 'COMPLETED' && completeData.live_url) {
            setIsDeployComplete(true);
            setLiveUrl(completeData.live_url);
          } else {
            setIsDeployComplete(false);
            setLiveUrl(undefined);
            setErrorMsg(completeData.message || 'Deployment failed on target server.');
          }
        },
        (err) => {
          console.error('SSE Error:', err);
          setIsDeploying(false);
        }
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Quick GitHub deploy failed.');
      setIsLoading(false);
      setIsDeploying(false);
    }
  };

  const handleLoadSample = async (type: 'broken' | 'clean' | 'python' | 'node') => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchSampleProject(type);
      setProjectId(data.project_id);
      setReport(data.report);
      setSubdomain(`demo-${data.project_id.slice(5, 11)}`);
      setActiveDeploymentId(null);
      setDeploymentEvents([]);
      setIsDeployComplete(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load sample project.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteActiveDeployment = async () => {
    const targetId = projectId || activeDeploymentId;
    if (!targetId) return;
    try {
      await deleteProjectDeployment(targetId);
      setActiveDeploymentId(null);
      setIsDeployComplete(false);
      setLiveUrl(undefined);
      setDeploymentEvents([]);
      await refreshDeployments();
    } catch (err: any) {
      console.error('Delete active deployment error:', err);
      await refreshDeployments();
    }
  };

  return (
    <div className="app-container">
      <Header />

      {/* Phone Cloud Capabilities & Status Bar */}
      {phoneCaps && phoneCaps.online && (
        <div
          className="glass-panel"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '10px 18px',
            marginBottom: '20px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.7), rgba(10, 15, 28, 0.8))',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            fontSize: '0.8rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span className="pulse-indicator" style={{ width: '8px', height: '8px' }}>
              <span className="pulse-ring" style={{ borderColor: '#10b981' }} />
              <span className="pulse-dot" style={{ background: '#10b981' }} />
            </span>
            <span style={{ fontWeight: 700, color: '#f8fafc', letterSpacing: '0.02em' }}>
              📱 Phone Cloud Node ({phoneCaps.host}:{phoneCaps.port})
            </span>
            <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>|</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.76rem' }}>Ready Runtimes:</span>
            {phoneCaps.ready_stacks?.map((stk) => (
              <span
                key={stk}
                style={{
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#34d399',
                  padding: '2px 8px',
                  borderRadius: '5px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {stk}
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', color: 'var(--text-secondary)', fontSize: '0.76rem', fontFamily: 'var(--font-mono)' }}>
            <span>PHP {phoneCaps.runtimes?.php?.installed ? '8.5' : '✕'}</span>
            <span>Python {phoneCaps.runtimes?.python?.installed ? '3.13' : '✕'}</span>
            <span>MariaDB {phoneCaps.runtimes?.mariadb?.installed ? '3306' : '✕'}</span>
            <span style={{ color: '#34d399', fontWeight: 600 }}>Cloudflare Edge ✅</span>
          </div>
        </div>
      )}

      {/* Real-Time Phone Hardware Telemetry */}
      <PhoneHardwareMonitor />

      {/* Multi-App Persistent Deployments Hub */}
      <ActiveDeploymentsHub deployments={allDeployments} onRefresh={refreshDeployments} />

      {errorMsg && (
        <div
          className="glass-card"
          style={{
            padding: '14px 20px',
            marginBottom: '24px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.9rem',
          }}
        >
          <span>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Flow: Upload -> Scorecard -> Terminal -> Architecture */}
      {!report ? (
        <UploadZone
          onFileSelect={handleFileUpload}
          onGitSubmit={handleGitSubmit}
          onQuickGitDeploy={handleQuickGitDeploy}
          isLoading={isLoading}
          onLoadSample={handleLoadSample}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* Top Reset Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={() => {
                setReport(null);
                setProjectId(null);
                setActiveDeploymentId(null);
              }}
              className="btn btn-outline"
              style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            >
              ← Inspect Another Project
            </button>

            <button
              onClick={() => setShowArchitecture(!showArchitecture)}
              className="btn btn-outline"
              style={{ fontSize: '0.8rem', padding: '6px 14px', color: '#10b981' }}
            >
              {showArchitecture ? 'Hide Architecture Guide' : 'Explain Architecture Blueprint'}
            </button>
          </div>

          {/* Architecture Visualizer Modal/Panel */}
          {showArchitecture && (
            <ArchitectureMap onClose={() => setShowArchitecture(false)} />
          )}

          {/* Doctor Scorecard */}
          <DoctorScorecard
            report={report}
            projectId={projectId!}
            onApplyFixes={handleApplyFixes}
            onDeploy={handleDeploy}
            isFixing={isFixing}
            isDeploying={isDeploying}
          />

          {/* Live Deployment Terminal Stream */}
          {activeDeploymentId && (
            <DeploymentTerminal
              deploymentId={activeDeploymentId}
              subdomain={subdomain}
              events={deploymentEvents}
              isComplete={isDeployComplete}
              liveUrl={liveUrl}
              onOpenArchitecture={() => setShowArchitecture(true)}
              onDeleteDeployment={handleDeleteActiveDeployment}
            />
          )}
        </div>
      )}
    </div>
  );
};
