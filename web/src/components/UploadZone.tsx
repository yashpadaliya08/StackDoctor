import React, { useState, useRef } from 'react';
import { UploadCloud, Github, FileArchive, Loader2, Sparkles, Zap, Server, ShieldCheck, ArrowRight } from 'lucide-react';
import { MySQLConfig } from '../api';

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  onGitSubmit: (url: string, branch?: string) => void;
  onQuickGitDeploy: (url: string, branch: string | undefined, dbConfig: MySQLConfig) => void;
  isLoading: boolean;
  onLoadSample: (type: 'broken' | 'clean' | 'python' | 'node') => void;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  onFileSelect,
  onGitSubmit,
  onQuickGitDeploy,
  isLoading,
  onLoadSample,
}) => {
  const [tab, setTab] = useState<'zip' | 'git' | 'quick'>('zip');
  const [isDragging, setIsDragging] = useState(false);
  const [gitUrl, setGitUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('main');
  // Quick Deploy state
  const [quickUrl, setQuickUrl] = useState('');
  const [quickBranch, setQuickBranch] = useState('');
  const [quickDbName, setQuickDbName] = useState('');
  const [quickRunSeeder, setQuickRunSeeder] = useState(false);
  const [quickSeederClass, setQuickSeederClass] = useState('DatabaseSeeder');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.zip')) {
        onFileSelect(file);
      } else {
        alert('Please upload a .zip archive of your Laravel, MERN, or Python project.');
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className="glass-card" style={{ padding: '32px', position: 'relative', overflow: 'hidden' }}>
      {/* Decorative ambient background orb */}
      <div
        style={{
          position: 'absolute',
          top: '-60px',
          right: '-40px',
          width: '260px',
          height: '260px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(6, 182, 212, 0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Tabs Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '28px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          paddingBottom: '16px',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '6px',
            padding: '4px',
            background: 'rgba(5, 8, 20, 0.7)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.4)',
          }}
        >
          <button
            onClick={() => setTab('zip')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              borderRadius: '9px',
              border: tab === 'zip' ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid transparent',
              background:
                tab === 'zip'
                  ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(59, 130, 246, 0.15))'
                  : 'transparent',
              color: tab === 'zip' ? '#38bdf8' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.84rem',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
              boxShadow: tab === 'zip' ? '0 0 16px rgba(6, 182, 212, 0.25)' : 'none',
            }}
          >
            <FileArchive size={16} />
            <span>Upload .ZIP Archive</span>
          </button>

          <button
            onClick={() => setTab('git')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              borderRadius: '9px',
              border: tab === 'git' ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid transparent',
              background:
                tab === 'git'
                  ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(99, 102, 241, 0.15))'
                  : 'transparent',
              color: tab === 'git' ? '#c084fc' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.84rem',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
              boxShadow: tab === 'git' ? '0 0 16px rgba(139, 92, 246, 0.25)' : 'none',
            }}
          >
            <Github size={16} />
            <span>Git Repository URL</span>
          </button>

          <button
            onClick={() => setTab('quick')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              borderRadius: '9px',
              border: tab === 'quick' ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid transparent',
              background:
                tab === 'quick'
                  ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(217, 119, 6, 0.15))'
                  : 'transparent',
              color: tab === 'quick' ? '#fcd34d' : '#f59e0b',
              fontWeight: 700,
              fontSize: '0.84rem',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
              boxShadow: tab === 'quick' ? '0 0 18px rgba(245, 158, 11, 0.3)' : 'none',
            }}
          >
            <Zap size={16} />
            <span>⚡ 1-Click Fast Deploy</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          <ShieldCheck size={15} color="#10b981" />
          <span>Zero-downtime Termux ARM64 runtime</span>
        </div>
      </div>

      {tab === 'zip' ? (
        <div>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.12)'}`,
              borderRadius: '16px',
              padding: '52px 24px',
              textAlign: 'center',
              cursor: isLoading ? 'wait' : 'pointer',
              background: isDragging
                ? 'radial-gradient(circle at center, rgba(6, 182, 212, 0.12) 0%, rgba(13, 19, 31, 0.8) 70%)'
                : 'linear-gradient(180deg, rgba(13, 19, 33, 0.6) 0%, rgba(9, 14, 26, 0.8) 100%)',
              boxShadow: isDragging
                ? '0 0 35px rgba(6, 182, 212, 0.25), inset 0 0 25px rgba(6, 182, 212, 0.1)'
                : 'none',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              position: 'relative',
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              accept=".zip"
              style={{ display: 'none' }}
              disabled={isLoading}
            />

            {isLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '16px',
                    background: 'rgba(6, 182, 212, 0.12)',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 24px rgba(6, 182, 212, 0.3)',
                  }}
                >
                  <Loader2 size={32} className="spinning" color="#38bdf8" />
                </div>
                <p style={{ fontWeight: 700, fontSize: '1.05rem', color: '#38bdf8', letterSpacing: '-0.01em' }}>
                  Decompressing & Diagnosing Project Architecture...
                </p>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', maxWidth: '480px' }}>
                  Analyzing framework fingerprint, composer/package dependencies, SQLite/MariaDB schemas, and Vite asset manifests.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '16px',
                    background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.16), rgba(139, 92, 246, 0.16))',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '4px',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4), 0 0 16px rgba(6, 182, 212, 0.2)',
                  }}
                >
                  <UploadCloud size={30} color="#38bdf8" />
                </div>

                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
                  Drag & Drop your project <span className="text-gradient-cyan">.ZIP archive</span>
                </h3>

                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', maxWidth: '460px', margin: 0 }}>
                  Drop any local codebase archive or click to browse. StackDoctor automatically detects the framework, repairs missing configs, and deploys it live.
                </p>

                {/* Framework Pill Badges */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '8px' }}>
                  <span
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      color: '#fca5a5',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      padding: '3px 10px',
                      borderRadius: '6px',
                    }}
                  >
                    🐘 Laravel (PHP 8.3/8.2)
                  </span>
                  <span
                    style={{
                      background: 'rgba(14, 165, 233, 0.1)',
                      border: '1px solid rgba(14, 165, 233, 0.25)',
                      color: '#7dd3fc',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      padding: '3px 10px',
                      borderRadius: '6px',
                    }}
                  >
                    ⚡ MERN / Node.js Express
                  </span>
                  <span
                    style={{
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      color: '#6ee7b7',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      padding: '3px 10px',
                      borderRadius: '6px',
                    }}
                  >
                    🐍 FastAPI / Python 3.13
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Demo Test Fixtures */}
          <div
            style={{
              marginTop: '22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              paddingTop: '18px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '6px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Sparkles size={14} color="#f59e0b" />
              </div>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Test Fixtures &amp; Demo Architectures:
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onLoadSample('broken');
                }}
                disabled={isLoading}
                className="btn btn-outline"
                style={{
                  fontSize: '0.78rem',
                  padding: '6px 13px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  borderColor: 'rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  fontWeight: 600,
                }}
                title="Dirty student project with MySQL, missing .env, and broken Vite paths"
              >
                🚨 Dirty Student App (MySQL+Vite)
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onLoadSample('clean');
                }}
                disabled={isLoading}
                className="btn btn-outline"
                style={{
                  fontSize: '0.78rem',
                  padding: '6px 13px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  borderColor: 'rgba(16, 185, 129, 0.3)',
                  color: '#6ee7b7',
                  fontWeight: 600,
                }}
                title="Standard Laravel 11 app with SQLite"
              >
                ✨ Clean Laravel 11 (SQLite)
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onLoadSample('python');
                }}
                disabled={isLoading}
                className="btn btn-outline"
                style={{
                  fontSize: '0.78rem',
                  padding: '6px 13px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  borderColor: '#059669',
                  color: '#34d399',
                  fontWeight: 600,
                }}
                title="High-performance FastAPI microservice on Python 3.13"
              >
                ⚡ FastAPI Microservice (Python)
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onLoadSample('node');
                }}
                disabled={isLoading}
                className="btn btn-outline"
                style={{
                  fontSize: '0.78rem',
                  padding: '6px 13px',
                  background: 'rgba(2, 132, 199, 0.1)',
                  borderColor: '#0284c7',
                  color: '#38bdf8',
                  fontWeight: 600,
                }}
                title="Full-stack Express + React SPA Bridge"
              >
                ⚡ MERN / Express Web App
              </button>
            </div>
          </div>
        </div>
      ) : tab === 'git' ? (
        <div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (gitUrl.trim()) onGitSubmit(gitUrl.trim(), gitBranch.trim() || undefined);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}
          >
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 320px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: '8px',
                    letterSpacing: '0.02em',
                  }}
                >
                  PUBLIC OR PRIVATE GIT REPOSITORY URL
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="url"
                    placeholder="https://github.com/username/hotel-management"
                    value={gitUrl}
                    onChange={(e) => setGitUrl(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '13px 16px 13px 42px',
                      borderRadius: '10px',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      background: 'rgba(5, 8, 20, 0.6)',
                      color: '#ffffff',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.875rem',
                      outline: 'none',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = 'var(--accent-violet)';
                      e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.2)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                  <Github
                    size={18}
                    color="var(--text-muted)"
                    style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}
                  />
                </div>
              </div>

              <div style={{ width: '140px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: '8px',
                    letterSpacing: '0.02em',
                  }}
                >
                  BRANCH
                </label>
                <input
                  type="text"
                  placeholder="main"
                  value={gitBranch}
                  onChange={(e) => setGitBranch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '13px 16px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(5, 8, 20, 0.6)',
                    color: '#ffffff',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.875rem',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading || !gitUrl}
              style={{
                width: 'fit-content',
                padding: '12px 28px',
                borderRadius: '10px',
                fontSize: '0.9rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="spinning" />
                  <span>Cloning &amp; Diagnosing Repo...</span>
                </>
              ) : (
                <>
                  <span>Run StackDoctor Diagnostic Engine</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>
      ) : (
        /* Quick Deploy Form */
        <div>
          <div
            style={{
              padding: '14px 18px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(217, 119, 6, 0.05))',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(245, 158, 11, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Zap size={20} color="#f59e0b" />
            </div>
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#fcd34d' }}>
                Autonomous 1-Click Git-to-Live Engine
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Provide any GitHub repo URL. StackDoctor auto-resolves dependencies, provisions MySQL database, establishes Cloudflare tunneling, and publishes live.
              </div>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (quickUrl.trim()) {
                const dbConfig: MySQLConfig = {
                  db_name: quickDbName.trim(),
                  db_user: 'root',
                  db_password: '',
                  run_seeder: quickRunSeeder,
                  seeder_class: quickSeederClass.trim() || 'DatabaseSeeder',
                };
                onQuickGitDeploy(quickUrl.trim(), quickBranch.trim() || undefined, dbConfig);
              }
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            {/* URL + Branch row */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 320px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: '8px',
                  }}
                >
                  GITHUB REPOSITORY URL
                </label>
                <input
                  id="quick-deploy-url"
                  type="url"
                  placeholder="https://github.com/username/my-awesome-app"
                  value={quickUrl}
                  onChange={(e) => setQuickUrl(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '13px 16px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(5, 8, 20, 0.6)',
                    color: '#ffffff',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.875rem',
                    outline: 'none',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--accent-amber)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(245, 158, 11, 0.2)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>

              <div style={{ width: '130px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: '8px',
                  }}
                >
                  BRANCH (OPT.)
                </label>
                <input
                  type="text"
                  placeholder="main"
                  value={quickBranch}
                  onChange={(e) => setQuickBranch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '13px 16px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(5, 8, 20, 0.6)',
                    color: '#ffffff',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.875rem',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Compact DB Config Card */}
            <div
              style={{
                display: 'flex',
                gap: '14px',
                flexWrap: 'wrap',
                padding: '14px 18px',
                background: 'rgba(11, 15, 25, 0.8)',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  color: 'var(--accent-cyan)',
                  letterSpacing: '0.04em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexShrink: 0,
                }}
              >
                <Server size={14} />
                <span>DATABASE CONFIG</span>
              </div>

              <input
                type="text"
                placeholder="database name (auto-assigned)"
                value={quickDbName}
                onChange={(e) => setQuickDbName(e.target.value)}
                style={{
                  flex: '1 1 160px',
                  padding: '9px 14px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(5, 8, 20, 0.7)',
                  color: '#e2e8f0',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.84rem',
                  outline: 'none',
                }}
              />

              {/* Seeder toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  🌱 Run Seeder
                </span>
                <button
                  type="button"
                  onClick={() => setQuickRunSeeder(!quickRunSeeder)}
                  style={{
                    width: '40px',
                    height: '22px',
                    borderRadius: '11px',
                    background: quickRunSeeder ? 'var(--accent-emerald)' : 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background 0.2s',
                    boxShadow: quickRunSeeder ? '0 0 10px rgba(16, 185, 129, 0.4)' : 'none',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '3px',
                      left: quickRunSeeder ? '21px' : '3px',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: '#ffffff',
                      transition: 'left 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  />
                </button>
              </div>

              {quickRunSeeder && (
                <input
                  type="text"
                  placeholder="DatabaseSeeder"
                  value={quickSeederClass}
                  onChange={(e) => setQuickSeederClass(e.target.value)}
                  style={{
                    flex: '1 1 150px',
                    padding: '9px 14px',
                    borderRadius: '8px',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    background: 'rgba(6, 78, 59, 0.3)',
                    color: '#34d399',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.84rem',
                    outline: 'none',
                  }}
                />
              )}
            </div>

            <button
              id="quick-deploy-btn"
              type="submit"
              disabled={isLoading || !quickUrl}
              style={{
                width: 'fit-content',
                padding: '13px 32px',
                borderRadius: '10px',
                border: 'none',
                background:
                  isLoading || !quickUrl
                    ? 'rgba(255, 255, 255, 0.08)'
                    : 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: isLoading || !quickUrl ? 'var(--text-muted)' : '#ffffff',
                fontWeight: 700,
                fontSize: '0.92rem',
                cursor: isLoading || !quickUrl ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: isLoading || !quickUrl ? 'none' : '0 4px 18px rgba(245, 158, 11, 0.35)',
                transition: 'all 0.15s ease',
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="spinning" />
                  <span>Cloning, Fixing &amp; Deploying...</span>
                </>
              ) : (
                <>
                  <Zap size={16} />
                  <span>Clone, Fix &amp; Deploy Live →</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

