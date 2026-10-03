import React, { useEffect, useState } from 'react';
import { Cpu, HardDrive, RefreshCw, Smartphone } from 'lucide-react';
import { fetchPhoneStats, PhoneStats } from '../api';

export const PhoneHardwareMonitor: React.FC = () => {
  const [stats, setStats] = useState<PhoneStats | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStats = async () => {
    try {
      const data = await fetchPhoneStats();
      if (data && data.online) {
        setStats(data);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!stats || !stats.online) {
    return null;
  }

  const ramUsedGb = ((stats.ram?.used_mb || 0) / 1024).toFixed(1);
  const ramTotalGb = ((stats.ram?.total_mb || 0) / 1024).toFixed(1);
  const ramPercent = stats.ram?.percent || 0;

  return (
    <div
      className="glass-panel"
      style={{
        borderRadius: '12px',
        padding: '12px 20px',
        marginBottom: '22px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        background: 'linear-gradient(135deg, rgba(10, 15, 30, 0.75) 0%, rgba(5, 8, 20, 0.85) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Title / Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '9px',
            background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(16, 185, 129, 0.15))',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-cyan)',
          }}
        >
          <Smartphone size={18} />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '0.82rem',
                fontWeight: 700,
                color: '#f8fafc',
                letterSpacing: '0.02em',
              }}
            >
              PHONE CLOUD TELEMETRY
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                color: 'var(--accent-cyan)',
                background: 'rgba(6, 182, 212, 0.1)',
                padding: '1px 6px',
                borderRadius: '4px',
                border: '1px solid rgba(6, 182, 212, 0.25)',
              }}
            >
              {stats.ip}:{stats.port}
            </span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="pulse-indicator" style={{ width: '6px', height: '6px' }}>
              <span className="pulse-ring" style={{ borderColor: '#10b981' }} />
              <span className="pulse-dot" style={{ background: '#10b981' }} />
            </span>
            <span>ARM64 Termux Host • 24/7 Edge Worker Active</span>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '24px' }}>
        {/* RAM Metric */}
        <div style={{ minWidth: '160px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '5px' }}>
            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Cpu size={12} color="var(--accent-cyan)" /> RAM Memory
            </span>
            <span style={{ color: ramPercent > 85 ? '#f87171' : '#34d399', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
              {ramUsedGb}/{ramTotalGb} GB ({ramPercent}%)
            </span>
          </div>
          <div style={{ width: '100%', height: '5px', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${ramPercent}%`,
                height: '100%',
                background: ramPercent > 85 ? 'var(--accent-rose)' : 'linear-gradient(90deg, #10b981, #06b6d4)',
                borderRadius: '3px',
                boxShadow: ramPercent > 85 ? '0 0 8px #f43f5e' : '0 0 8px rgba(16, 185, 129, 0.4)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>

        {/* Disk Storage Metric */}
        <div style={{ minWidth: '160px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '5px' }}>
            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <HardDrive size={12} color="var(--accent-violet)" /> Flash Storage
            </span>
            <span style={{ color: '#38bdf8', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
              {stats.disk?.used} / {stats.disk?.total}
            </span>
          </div>
          <div style={{ width: '100%', height: '5px', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
            <div
              style={{
                width: stats.disk?.percent || '40%',
                height: '100%',
                background: 'linear-gradient(90deg, #8b5cf6, #38bdf8)',
                borderRadius: '3px',
                boxShadow: '0 0 8px rgba(56, 189, 248, 0.3)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>

        {/* CPU Load Metric */}
        <div style={{ textAlign: 'center', padding: '0 4px' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            CPU Load (1m)
          </div>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
            {stats.cpu?.load_1m || '0.00'}{' '}
            <span style={{ fontSize: '0.68rem', color: '#34d399', fontWeight: 600 }}>OPTIMAL</span>
          </div>
        </div>

        {/* Running Processes */}
        <div style={{ textAlign: 'center', padding: '0 4px' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Live Services
          </div>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#34d399', fontFamily: 'var(--font-mono)' }}>
            {stats.active_processes || 1} Active
          </div>
        </div>

        {/* Quick Refresh Button */}
        <button
          onClick={() => {
            setLoading(true);
            loadStats().finally(() => setLoading(false));
          }}
          disabled={loading}
          style={{
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            color: 'var(--text-secondary)',
            padding: '5px 8px',
            fontSize: '0.74rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          title="Refresh telemetry"
        >
          <RefreshCw size={13} className={loading ? 'spinning' : ''} />
        </button>
      </div>
    </div>
  );
};

