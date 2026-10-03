import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  fetchProjectAnalytics,
  fetchAlertConfig,
  saveAlertConfig,
  testAlertNotification,
  probeDeployment,
  startBenchmark,
  fetchBenchmarkStatus,
  resetProjectAnalytics,
  APMTelemetry,
  AlertConfig,
  BenchmarkState,
} from '../api';

interface Props {
  projectId: string;
  projectName: string;
  liveUrl?: string;
  port?: number;
  onClose: () => void;
}

export const DeploymentAnalyticsModal: React.FC<Props> = ({
  projectId,
  projectName,
  liveUrl,
  port,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'apm' | 'benchmark' | 'alerts'>('apm');
  const [telemetry, setTelemetry] = useState<APMTelemetry | null>(null);
  const [alertCfg, setAlertCfg] = useState<AlertConfig>({
    webhook_url: '',
    channel_type: 'discord',
    notify_on_down: true,
    notify_on_autoheal: true,
    notify_on_spike: true,
    enabled: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAlerts, setIsSavingAlerts] = useState(false);
  const [isTestingAlerts, setIsTestingAlerts] = useState(false);
  const [alertStatusMsg, setAlertStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Live on-demand probe state
  const [isProbing, setIsProbing] = useState(false);
  const [lastProbeResult, setLastProbeResult] = useState<{ status_code: number; latency_ms: number } | null>(null);

  // Benchmark suite state
  const [targetMode, setTargetMode] = useState<'cloudflare' | 'local'>('cloudflare');
  const [concurrency, setConcurrency] = useState<number>(25);
  const [durationSec, setDurationSec] = useState<number>(10);
  const [testPath, setTestPath] = useState<string>('/');
  const [benchmarkState, setBenchmarkState] = useState<BenchmarkState>({
    status: 'IDLE',
    progress_pct: 0,
    elapsed_sec: 0,
    requests_completed: 0,
    current_rps: 0.0,
    errors_count: 0,
  });
  const [benchmarkLaunchMsg, setBenchmarkLaunchMsg] = useState<string | null>(null);
  const [benchmarkErrorMsg, setBenchmarkErrorMsg] = useState<string | null>(null);

  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);

  const pollTimerRef = useRef<any>(null);

  // Lock body scroll while modal is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [projectId]);

  // Check benchmark status on mount
  useEffect(() => {
    fetchBenchmarkStatus(projectId)
      .then((st) => {
        if (st && st.status) setBenchmarkState(st);
      })
      .catch(() => {});
  }, [projectId]);

  const loadData = async () => {
    try {
      const [apm, cfg] = await Promise.all([
        fetchProjectAnalytics(projectId),
        fetchAlertConfig(),
      ]);
      setTelemetry(apm);
      if (cfg && cfg.webhook_url !== undefined) {
        setAlertCfg(cfg);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const getEffectiveTargetUrl = (): string => {
    if (targetMode === 'local' && port) {
      return `http://127.0.0.1:${port}`;
    }
    return liveUrl || (port ? `http://127.0.0.1:${port}` : '');
  };

  const handleResetAnalytics = async () => {
    if (!window.confirm(`Reset APM telemetry and metrics for ${projectName}? This clears historical error samples and restores a clean 100% health baseline.`)) {
      return;
    }
    setIsResetting(true);
    setResetSuccessMsg(null);
    try {
      const res = await resetProjectAnalytics(projectId);
      if (res.summary) setTelemetry(res.summary);
      setBenchmarkState({
        status: 'IDLE',
        progress_pct: 0,
        elapsed_sec: 0,
        requests_completed: 0,
        current_rps: 0.0,
        errors_count: 0,
        latest_result: undefined,
      });
      setLastProbeResult(null);
      setResetSuccessMsg('✔ Telemetry samples and stress test results reset to 100% clean baseline.');
      setTimeout(() => setResetSuccessMsg(null), 4000);
    } catch (e) {
      console.error('Reset failed:', e);
    } finally {
      setIsResetting(false);
    }
  };

  const handleLiveProbe = async () => {
    setIsProbing(true);
    try {
      const target = getEffectiveTargetUrl();
      const res = await probeDeployment(projectId, target, testPath);
      setLastProbeResult(res);
      await loadData();
    } catch (e) {
      console.error('Probe failed:', e);
    } finally {
      setIsProbing(false);
    }
  };

  const handleStartBenchmark = async () => {
    const target = getEffectiveTargetUrl();
    setBenchmarkLaunchMsg(null);
    setBenchmarkErrorMsg(null);

    try {
      const res = await startBenchmark(projectId, target, concurrency, durationSec, testPath);
      setBenchmarkLaunchMsg(res.message);
      setBenchmarkState((prev) => ({
        ...prev,
        status: 'RUNNING',
        progress_pct: 1,
        elapsed_sec: 0,
        requests_completed: 0,
        current_rps: 0,
      }));

      // Start rapid polling
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(async () => {
        try {
          const st = await fetchBenchmarkStatus(projectId);
          setBenchmarkState(st);
          if (st.status === 'COMPLETED' || st.status === 'FAILED') {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
            await loadData();
          }
        } catch {
          // ignore transient poll error
        }
      }, 700);
    } catch (err: any) {
      setBenchmarkErrorMsg(err.message || 'Failed to start benchmark');
    }
  };

  const handleSaveAlerts = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingAlerts(true);
    setAlertStatusMsg(null);
    try {
      await saveAlertConfig(alertCfg);
      setAlertStatusMsg({ type: 'success', text: 'Alert webhook configuration saved successfully!' });
    } catch (e: any) {
      setAlertStatusMsg({ type: 'error', text: e.message || 'Failed to save configuration' });
    } finally {
      setIsSavingAlerts(false);
    }
  };

  const handleTestAlert = async () => {
    setIsTestingAlerts(true);
    setAlertStatusMsg(null);
    try {
      const res = await testAlertNotification();
      if (res.status === 'SUCCESS') {
        setAlertStatusMsg({ type: 'success', text: '✔ Live test notification dispatched to your webhook!' });
      } else {
        setAlertStatusMsg({ type: 'error', text: res.message || 'Test alert failed' });
      }
    } catch (e: any) {
      setAlertStatusMsg({ type: 'error', text: e.message || 'Failed to trigger test alert' });
    } finally {
      setIsTestingAlerts(false);
    }
  };

  const getLatencyColor = (ms: number) => {
    if (ms < 80) return '#34d399'; // green
    if (ms < 250) return '#38bdf8'; // cyan
    if (ms < 600) return '#fbbf24'; // amber
    return '#f87171'; // red
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(3, 7, 18, 0.88)',
        backdropFilter: 'blur(10px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          backgroundColor: '#0c111d',
          border: '1px solid #1e293b',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '860px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px rgba(168, 85, 247, 0.18)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#090d16',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📊</span> Edge APM Analytics & Stress Testing
              <span
                style={{
                  backgroundColor: '#7e22ce',
                  color: '#fff',
                  fontSize: '11px',
                  padding: '2px 9px',
                  borderRadius: '10px',
                  fontWeight: 600,
                }}
              >
                {projectName}
              </span>
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#94a3b8' }}>
              Real-time response latencies, percentile ladders, route profiling, and 1-click concurrency benchmarking.
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
            onClick={() => setActiveTab('apm')}
            style={{
              padding: '11px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'apm' ? '2px solid #a855f7' : '2px solid transparent',
              color: activeTab === 'apm' ? '#a855f7' : '#94a3b8',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            📈 Live Telemetry & Routes
          </button>
          <button
            onClick={() => setActiveTab('benchmark')}
            style={{
              padding: '11px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'benchmark' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'benchmark' ? '#38bdf8' : '#94a3b8',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            ⚡ Concurrency Stress Test
            {benchmarkState.status === 'RUNNING' && (
              <span style={{ fontSize: '9px', background: '#0284c7', color: '#fff', padding: '1px 6px', borderRadius: '8px' }}>
                RUNNING
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            style={{
              padding: '11px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'alerts' ? '2px solid #a855f7' : '2px solid transparent',
              color: activeTab === 'alerts' ? '#a855f7' : '#94a3b8',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            🚨 Incident Alerts (Discord / Slack)
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {/* TAB 1: LIVE TELEMETRY & APM */}
          {activeTab === 'apm' && (
            <div>
              {isLoading && !telemetry ? (
                <div style={{ color: '#94a3b8', textAlign: 'center', padding: '40px' }}>Loading real-time telemetry...</div>
              ) : telemetry ? (
                <div>
                  {/* Top Live Bar & Active Probe */}
                  <div
                    style={{
                      background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.7) 100%)',
                      border: '1px solid #1e293b',
                      borderRadius: '10px',
                      padding: '12px 16px',
                      marginBottom: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: '#10b981',
                          boxShadow: '0 0 8px #10b981',
                        }}
                      />
                      <span style={{ fontSize: '12px', color: '#cbd5e1' }}>Live Target:</span>
                      <code style={{ fontSize: '12px', color: '#38bdf8' }}>
                        {getEffectiveTargetUrl()}
                      </code>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {lastProbeResult && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: lastProbeResult.status_code === 200 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                            color: lastProbeResult.status_code === 200 ? '#34d399' : '#f87171',
                            border: `1px solid ${lastProbeResult.status_code === 200 ? '#059669' : '#dc2626'}`,
                          }}
                        >
                          Last Ping: {lastProbeResult.latency_ms}ms ({lastProbeResult.status_code})
                        </span>
                      )}
                      <button
                        onClick={handleLiveProbe}
                        disabled={isProbing}
                        style={{
                          background: isProbing ? '#334155' : 'linear-gradient(135deg, #7e22ce 0%, #6b21a8 100%)',
                          border: '1px solid #a855f7',
                          color: '#fff',
                          padding: '6px 14px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: isProbing ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        {isProbing ? 'Pinging...' : '⚡ Ping Live Response'}
                      </button>

                      <button
                        onClick={handleResetAnalytics}
                        disabled={isResetting}
                        style={{
                          background: isResetting ? '#334155' : 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          color: '#fca5a5',
                          padding: '6px 14px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: isResetting ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.2s ease',
                        }}
                        title="Clear historical failure samples and reset metrics to clean 100% baseline"
                      >
                        {isResetting ? 'Resetting...' : '🔄 Reset Telemetry'}
                      </button>
                    </div>
                  </div>

                  {resetSuccessMsg && (
                    <div
                      style={{
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid #10b981',
                        color: '#34d399',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      {resetSuccessMsg}
                    </div>
                  )}

                  {/* KPI Stat Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px' }}>
                      <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Uptime & Health</div>
                      <div style={{ color: '#34d399', fontSize: '22px', fontWeight: 800, marginTop: '4px' }}>
                        {telemetry.uptime_pct}%
                      </div>
                      <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>
                        Error rate: <strong style={{ color: telemetry.error_rate_pct > 0 ? '#f87171' : '#94a3b8' }}>{telemetry.error_rate_pct}%</strong>
                      </div>
                    </div>

                    <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px' }}>
                      <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Avg Latency</div>
                      <div style={{ color: getLatencyColor(telemetry.avg_latency_ms), fontSize: '22px', fontWeight: 800, marginTop: '4px' }}>
                        {telemetry.avg_latency_ms} <span style={{ fontSize: '13px', fontWeight: 500 }}>ms</span>
                      </div>
                      <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>
                        Median (p50): {telemetry.p50_latency_ms}ms
                      </div>
                    </div>

                    <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px' }}>
                      <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Throughput</div>
                      <div style={{ color: '#fbbf24', fontSize: '22px', fontWeight: 800, marginTop: '4px' }}>
                        {telemetry.instant_rps} <span style={{ fontSize: '13px', fontWeight: 500 }}>req/s</span>
                      </div>
                      <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>
                        {telemetry.throughput_rpm} reqs past min
                      </div>
                    </div>

                    <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px' }}>
                      <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Total Volume</div>
                      <div style={{ color: '#c084fc', fontSize: '22px', fontWeight: 800, marginTop: '4px' }}>
                        {telemetry.total_requests}
                      </div>
                      <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>
                        Tracked session hits
                      </div>
                    </div>
                  </div>

                  {/* Percentile Ladder */}
                  <div
                    style={{
                      background: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: '10px',
                      padding: '14px 18px',
                      marginBottom: '16px',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '10px' }}>
                      Latency Percentile Distribution (High-Precision Breakdown)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
                      {[
                        { label: 'Min', val: telemetry.min_latency_ms },
                        { label: 'p50 (Median)', val: telemetry.p50_latency_ms },
                        { label: 'p90', val: telemetry.p90_latency_ms },
                        { label: 'p95', val: telemetry.p95_latency_ms },
                        { label: 'p99', val: telemetry.p99_latency_ms },
                        { label: 'Max', val: telemetry.max_latency_ms },
                      ].map((item) => (
                        <div
                          key={item.label}
                          style={{
                            background: '#0d1526',
                            border: '1px solid #1e293b',
                            borderRadius: '6px',
                            padding: '8px 10px',
                            textAlign: 'center',
                          }}
                        >
                          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>{item.label}</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: getLatencyColor(item.val), marginTop: '3px' }}>
                            {item.val}ms
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Status Distribution Pills */}
                  <div
                    style={{
                      background: '#1e293b22',
                      border: '1px solid #1e293b',
                      borderRadius: '8px',
                      padding: '10px 16px',
                      marginBottom: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600 }}>HTTP Response Codes:</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span style={{ background: '#064e3b', color: '#34d399', padding: '3px 9px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                        2xx Success: {telemetry.status_distribution['2xx']}
                      </span>
                      <span style={{ background: '#1e3a8a', color: '#60a5fa', padding: '3px 9px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                        3xx Redirect: {telemetry.status_distribution['3xx']}
                      </span>
                      <span style={{ background: '#78350f', color: '#fbbf24', padding: '3px 9px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                        4xx Client Err: {telemetry.status_distribution['4xx']}
                      </span>
                      <span style={{ background: '#7f1d1d', color: '#fca5a5', padding: '3px 9px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                        5xx Server Err: {telemetry.status_distribution['5xx']}
                      </span>
                    </div>
                  </div>

                  {/* Timeline Bar Visualizer */}
                  <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '12px' }}>
                      Traffic Volume & Latency Timeline
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '85px', paddingBottom: '20px', borderBottom: '1px solid #1e293b' }}>
                      {telemetry.timeline.map((point, idx) => {
                        const heightPct = Math.min(100, Math.max(12, (point.requests / 10) * 100));
                        return (
                          <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                            <div
                              title={`${point.requests} requests (avg ${point.avg_latency}ms)`}
                              style={{
                                width: '100%',
                                height: `${heightPct}%`,
                                background: point.requests > 0 ? 'linear-gradient(180deg, #a855f7 0%, #38bdf8 100%)' : '#1e293b',
                                borderRadius: '3px 3px 0 0',
                                minHeight: '4px',
                              }}
                            />
                            <span style={{ fontSize: '9px', color: '#64748b', marginTop: '4px' }}>{point.time}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Route Profiler & Code Optimization Hints */}
                  <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '10px' }}>
                      Route Profiler & Code Bottleneck Analysis
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ color: '#64748b', borderBottom: '1px solid #1e293b' }}>
                            <th style={{ padding: '6px 8px' }}>Endpoint</th>
                            <th style={{ padding: '6px 8px' }}>Hits</th>
                            <th style={{ padding: '6px 8px' }}>Avg Latency</th>
                            <th style={{ padding: '6px 8px' }}>Range</th>
                            <th style={{ padding: '6px 8px' }}>Optimization Hint</th>
                          </tr>
                        </thead>
                        <tbody>
                          {telemetry.route_profiles && telemetry.route_profiles.length > 0 ? (
                            telemetry.route_profiles.map((rp) => (
                              <tr key={rp.path} style={{ borderBottom: '1px solid rgba(30, 41, 59, 0.4)' }}>
                                <td style={{ padding: '8px', color: '#38bdf8', fontFamily: 'monospace' }}>{rp.path}</td>
                                <td style={{ padding: '8px', color: '#cbd5e1' }}>{rp.count}</td>
                                <td style={{ padding: '8px', fontWeight: 700, color: getLatencyColor(rp.avg_latency_ms) }}>
                                  {rp.avg_latency_ms}ms
                                </td>
                                <td style={{ padding: '8px', color: '#64748b', fontSize: '11px' }}>
                                  {rp.min_latency_ms}ms – {rp.max_latency_ms}ms
                                </td>
                                <td style={{ padding: '8px', color: '#94a3b8' }}>
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      padding: '2px 8px',
                                      borderRadius: '4px',
                                      background: rp.avg_latency_ms > 200 ? 'rgba(251, 191, 36, 0.12)' : 'rgba(16, 185, 129, 0.1)',
                                      color: rp.avg_latency_ms > 200 ? '#fbbf24' : '#34d399',
                                    }}
                                  >
                                    {rp.optimization_hint}
                                  </span>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} style={{ padding: '16px', color: '#64748b', textAlign: 'center' }}>
                                No route telemetry recorded yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Phone Capacity Ceiling Assessment */}
                  {telemetry.capacity_estimate && (
                    <div
                      style={{
                        background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%)',
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        borderRadius: '10px',
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>📱</span> Edge Phone Server Capacity Ceiling
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                          {telemetry.capacity_estimate.summary}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '6px', padding: '6px 12px', textAlign: 'center' }}>
                          <div style={{ fontSize: '10px', color: '#64748b' }}>Safe RPS</div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8' }}>
                            ~{telemetry.capacity_estimate.max_safe_rps}
                          </div>
                        </div>
                        <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '6px', padding: '6px 12px', textAlign: 'center' }}>
                          <div style={{ fontSize: '10px', color: '#64748b' }}>PHP Workers</div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#34d399' }}>
                            {telemetry.capacity_estimate.php_workers}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 2: CONCURRENCY STRESS BENCHMARK */}
          {activeTab === 'benchmark' && (
            <div>
              {benchmarkLaunchMsg && (
                <div
                  style={{
                    background: 'rgba(5, 150, 105, 0.15)',
                    border: '1px solid #059669',
                    color: '#34d399',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    marginBottom: '16px',
                  }}
                >
                  🚀 {benchmarkLaunchMsg}
                </div>
              )}

              {/* Benchmark Configuration Panel */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  borderRadius: '10px',
                  padding: '18px 20px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>⚡</span>
                    <h4 style={{ margin: 0, fontSize: '14px', color: '#f8fafc', fontWeight: 700 }}>
                      1-Click Edge Concurrency Load Benchmark
                    </h4>
                  </div>
                  <span style={{ fontSize: '11px', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.15)', padding: '3px 9px', borderRadius: '10px' }}>
                    Non-Destructive • Async Engine
                  </span>
                </div>

                <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                  Simulate simultaneous concurrent users to test how many requests your phone server can sustain before latency slows down or packets drop.
                </p>

                {/* Settings Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '16px' }}>
                  {/* Concurrency Selector */}
                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                      Concurrent Users (VUs)
                    </label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[10, 25, 50, 100].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setConcurrency(num)}
                          disabled={benchmarkState.status === 'RUNNING'}
                          style={{
                            flex: 1,
                            padding: '6px 0',
                            borderRadius: '6px',
                            border: concurrency === num ? '1px solid #38bdf8' : '1px solid #334155',
                            background: concurrency === num ? '#0284c7' : '#090d16',
                            color: '#fff',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Duration Selector */}
                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                      Test Duration
                    </label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[5, 10, 20, 30].map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => setDurationSec(sec)}
                          disabled={benchmarkState.status === 'RUNNING'}
                          style={{
                            flex: 1,
                            padding: '6px 0',
                            borderRadius: '6px',
                            border: durationSec === sec ? '1px solid #a855f7' : '1px solid #334155',
                            background: durationSec === sec ? '#7e22ce' : '#090d16',
                            color: '#fff',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Target Endpoint Mode */}
                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                      Target Route
                    </label>
                    <input
                      type="text"
                      placeholder="/"
                      value={testPath}
                      onChange={(e) => setTestPath(e.target.value)}
                      disabled={benchmarkState.status === 'RUNNING'}
                      style={{
                        width: '100%',
                        background: '#090d16',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        color: '#38bdf8',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                {/* Target Mode Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Destination:</span>
                    <button
                      type="button"
                      onClick={() => setTargetMode('cloudflare')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        border: targetMode === 'cloudflare' ? '1px solid #0284c7' : '1px solid #334155',
                        background: targetMode === 'cloudflare' ? '#0284c722' : 'transparent',
                        color: targetMode === 'cloudflare' ? '#38bdf8' : '#64748b',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      🌐 Cloudflare Public Tunnel
                    </button>
                    {port && (
                      <button
                        type="button"
                        onClick={() => setTargetMode('local')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: targetMode === 'local' ? '1px solid #10b981' : '1px solid #334155',
                          background: targetMode === 'local' ? '#10b98122' : 'transparent',
                          color: targetMode === 'local' ? '#34d399' : '#64748b',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        📱 Local Phone Port (:{port})
                      </button>
                    )}
                  </div>

                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    Target: <code style={{ color: '#a78bfa' }}>{getEffectiveTargetUrl()}{testPath}</code>
                  </span>
                </div>

                {/* Launch Button */}
                <button
                  type="button"
                  onClick={handleStartBenchmark}
                  disabled={benchmarkState.status === 'RUNNING'}
                  style={{
                    width: '100%',
                    background: benchmarkState.status === 'RUNNING' ? '#0369a1' : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    border: '1px solid #38bdf8',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: benchmarkState.status === 'RUNNING' ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 15px rgba(2, 132, 199, 0.3)',
                  }}
                >
                  {benchmarkState.status === 'RUNNING' ? (
                    <>
                      <span>⏳</span>
                      Benchmarking In Progress ({benchmarkState.progress_pct}%)...
                    </>
                  ) : (
                    <>
                      <span>🚀</span>
                      Start Live Stress Benchmark ({concurrency} Users • {durationSec}s)
                    </>
                  )}
                </button>
              </div>

              {benchmarkErrorMsg && (
                <div style={{ background: '#7f1d1d', border: '1px solid #dc2626', color: '#fca5a5', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', marginBottom: '16px' }}>
                  ⚠ {benchmarkErrorMsg}
                </div>
              )}

              {/* Live Benchmark Execution Status Bar */}
              {benchmarkState.status === 'RUNNING' && (
                <div
                  style={{
                    background: '#090d16',
                    border: '1px solid #0284c7',
                    borderRadius: '10px',
                    padding: '16px 20px',
                    marginBottom: '20px',
                    boxShadow: '0 0 20px rgba(2, 132, 199, 0.2)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 8px #38bdf8' }} />
                      <strong style={{ color: '#f8fafc', fontSize: '13px' }}>Simulating {benchmarkState.concurrency} Concurrent Visitors</strong>
                    </div>
                    <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: '13px' }}>
                      {benchmarkState.progress_pct}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div style={{ width: '100%', height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden', marginBottom: '14px' }}>
                    <div
                      style={{
                        width: `${benchmarkState.progress_pct}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #38bdf8, #a855f7)',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>

                  {/* Real-time counters */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', textAlign: 'center' }}>
                    <div style={{ background: '#0d1526', padding: '8px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>Requests Sent</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', marginTop: '2px' }}>
                        {benchmarkState.requests_completed}
                      </div>
                    </div>
                    <div style={{ background: '#0d1526', padding: '8px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>Current RPS</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#34d399', marginTop: '2px' }}>
                        {benchmarkState.current_rps} req/s
                      </div>
                    </div>
                    <div style={{ background: '#0d1526', padding: '8px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>Elapsed</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#fbbf24', marginTop: '2px' }}>
                        {benchmarkState.elapsed_sec}s
                      </div>
                    </div>
                    <div style={{ background: '#0d1526', padding: '8px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>Errors</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: benchmarkState.errors_count > 0 ? '#f87171' : '#34d399', marginTop: '2px' }}>
                        {benchmarkState.errors_count}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Benchmark Result Card */}
              {benchmarkState.latest_result && (
                <div
                  style={{
                    background: '#090d16',
                    border: '1px solid #1e293b',
                    borderRadius: '12px',
                    padding: '20px',
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '18px' }}>📋</span>
                      <h4 style={{ margin: 0, fontSize: '14px', color: '#f8fafc', fontWeight: 700 }}>
                        Official Phone Concurrency Benchmark Report
                      </h4>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 800,
                          letterSpacing: '0.04em',
                          background:
                            benchmarkState.latest_result.rating === 'EXCELLENT'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : benchmarkState.latest_result.rating === 'GOOD'
                              ? 'rgba(56, 189, 248, 0.15)'
                              : 'rgba(239, 68, 68, 0.15)',
                          color:
                            benchmarkState.latest_result.rating === 'EXCELLENT'
                              ? '#34d399'
                              : benchmarkState.latest_result.rating === 'GOOD'
                              ? '#38bdf8'
                              : '#f87171',
                          border: `1px solid ${
                            benchmarkState.latest_result.rating === 'EXCELLENT'
                              ? '#059669'
                              : benchmarkState.latest_result.rating === 'GOOD'
                              ? '#0284c7'
                              : '#dc2626'
                          }`,
                        }}
                      >
                        {benchmarkState.latest_result.rating}
                      </span>

                      <button
                        type="button"
                        onClick={handleResetAnalytics}
                        disabled={isResetting}
                        style={{
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#fca5a5',
                          padding: '4px 10px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: isResetting ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                        title="Clear this benchmark report and reset APM baseline"
                      >
                        {isResetting ? 'Resetting...' : '🔄 Clear & Reset'}
                      </button>
                    </div>
                  </div>

                  {/* Plain English Assessment */}
                  <div
                    style={{
                      background: '#1e293b33',
                      border: '1px solid #1e293b',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      fontSize: '12px',
                      color: '#cbd5e1',
                      lineHeight: 1.5,
                      marginBottom: '16px',
                    }}
                  >
                    {benchmarkState.latest_result.assessment}
                  </div>

                  {/* Benchmark Metrics Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ background: '#0c111d', border: '1px solid #1e293b', borderRadius: '6px', padding: '10px' }}>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>Average RPS</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#34d399', marginTop: '3px' }}>
                        {benchmarkState.latest_result.avg_rps} <span style={{ fontSize: '11px', fontWeight: 500 }}>req/s</span>
                      </div>
                    </div>

                    <div style={{ background: '#0c111d', border: '1px solid #1e293b', borderRadius: '6px', padding: '10px' }}>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>Total Requests</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#38bdf8', marginTop: '3px' }}>
                        {benchmarkState.latest_result.total_requests}
                      </div>
                    </div>

                    <div style={{ background: '#0c111d', border: '1px solid #1e293b', borderRadius: '6px', padding: '10px' }}>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>p95 Latency</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: getLatencyColor(benchmarkState.latest_result.p95_latency_ms), marginTop: '3px' }}>
                        {benchmarkState.latest_result.p95_latency_ms} <span style={{ fontSize: '11px', fontWeight: 500 }}>ms</span>
                      </div>
                    </div>

                    <div style={{ background: '#0c111d', border: '1px solid #1e293b', borderRadius: '6px', padding: '10px' }}>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>Error Rate</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: benchmarkState.latest_result.error_rate_pct === 0 ? '#34d399' : '#f87171', marginTop: '3px' }}>
                        {benchmarkState.latest_result.error_rate_pct}%
                      </div>
                    </div>
                  </div>

                  {/* Percentile ladder */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', background: '#0d1526', padding: '8px 12px', borderRadius: '6px' }}>
                    <span>Median p50: <strong style={{ color: '#f8fafc' }}>{benchmarkState.latest_result.p50_latency_ms}ms</strong></span>
                    <span>p90: <strong style={{ color: '#f8fafc' }}>{benchmarkState.latest_result.p90_latency_ms}ms</strong></span>
                    <span>p95: <strong style={{ color: '#f8fafc' }}>{benchmarkState.latest_result.p95_latency_ms}ms</strong></span>
                    <span>p99: <strong style={{ color: '#f8fafc' }}>{benchmarkState.latest_result.p99_latency_ms}ms</strong></span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: INCIDENT ALERTS */}
          {activeTab === 'alerts' && (
            <div>
              {alertStatusMsg && (
                <div
                  style={{
                    background: alertStatusMsg.type === 'success' ? '#064e3b' : '#7f1d1d',
                    border: alertStatusMsg.type === 'success' ? '1px solid #059669' : '1px solid #dc2626',
                    color: alertStatusMsg.type === 'success' ? '#34d399' : '#fca5a5',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    marginBottom: '16px',
                  }}
                >
                  {alertStatusMsg.text}
                </div>
              )}

              <p style={{ color: '#cbd5e1', fontSize: '13px', margin: '0 0 16px', lineHeight: 1.6 }}>
                Receive instant push alerts on Discord, Slack, or Telegram whenever your phone application crashes, when 5xx errors spike, or when the 24/7 Watchdog initiates automated self-healing.
              </p>

              <form onSubmit={handleSaveAlerts}>
                <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                  <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                    Webhook Destination URL (Discord / Slack / Telegram)
                  </label>
                  <input
                    type="url"
                    placeholder="https://discord.com/api/webhooks/... or https://hooks.slack.com/..."
                    value={alertCfg.webhook_url}
                    onChange={(e) => setAlertCfg({ ...alertCfg, webhook_url: e.target.value })}
                    style={{
                      width: '100%',
                      background: '#1e293b',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      marginTop: '6px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '10px' }}>
                    Notification Triggers
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: '#cbd5e1' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={alertCfg.notify_on_down}
                        onChange={(e) => setAlertCfg({ ...alertCfg, notify_on_down: e.target.checked })}
                      />
                      <span>🚨 <strong>Container Offline / 502 Bad Gateway:</strong> Alert when application becomes unreachable.</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={alertCfg.notify_on_autoheal}
                        onChange={(e) => setAlertCfg({ ...alertCfg, notify_on_autoheal: e.target.checked })}
                      />
                      <span>🛡️ <strong>Watchdog Auto-Heal:</strong> Notify when background watchdog revives the container.</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={alertCfg.notify_on_spike}
                        onChange={(e) => setAlertCfg({ ...alertCfg, notify_on_spike: e.target.checked })}
                      />
                      <span>⚡ <strong>High Error Spike:</strong> Alert if failure rate exceeds 10% under load.</span>
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="submit"
                    disabled={isSavingAlerts}
                    style={{
                      background: '#0284c7',
                      color: '#fff',
                      border: 'none',
                      padding: '8px 18px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {isSavingAlerts ? 'Saving...' : 'Save Configuration'}
                  </button>
                  <button
                    type="button"
                    onClick={handleTestAlert}
                    disabled={isTestingAlerts || !alertCfg.webhook_url}
                    style={{
                      background: '#334155',
                      color: '#fff',
                      border: 'none',
                      padding: '8px 18px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: isTestingAlerts || !alertCfg.webhook_url ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isTestingAlerts ? 'Sending...' : '🔔 Send Test Alert'}
                  </button>
                </div>
              </form>
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
