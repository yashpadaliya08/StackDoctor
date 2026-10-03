import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, CheckCircle2, Loader2, BookOpen, Copy, Check, QrCode, Globe, Trash2 } from 'lucide-react';
import { DeploymentLogEvent } from '../api';

interface DeploymentTerminalProps {
  deploymentId: string;
  subdomain: string;
  events: DeploymentLogEvent[];
  isComplete: boolean;
  liveUrl?: string;
  onOpenArchitecture: () => void;
  onDeleteDeployment?: () => void;
}

export const DeploymentTerminal: React.FC<DeploymentTerminalProps> = ({
  deploymentId,
  subdomain,
  events,
  isComplete,
  liveUrl,
  onOpenArchitecture,
  onDeleteDeployment,
}) => {
  const terminalBodyRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const hasError = events.some((e) => e.level === 'ERROR' || e.stage === 'ERROR');

  useEffect(() => {
    if (terminalBodyRef.current) {
      terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight;
    }
  }, [events]);

  const handleCopy = () => {
    if (!liveUrl) return;
    navigator.clipboard.writeText(liveUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Live URL Banner on Completion */}
      {isComplete && liveUrl && !hasError && (
        <div
          className="glass-card"
          style={{
            padding: '24px',
            background: '#111827',
            border: '1px solid #10b981',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '10px',
                  background: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckCircle2 size={24} color="#ffffff" />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ fontSize: '1.25rem', color: '#ffffff', fontWeight: 800 }}>Your Application is LIVE!</h3>
                  <span className="badge badge-pass" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
                    24/7 ACTIVE
                  </span>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Hosted on your Spare Phone Cloud (ARM64) • Secured by 24/7 Cloudflare Edge SSL
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowQr(!showQr)}
                className="btn btn-outline"
                style={{ fontSize: '0.85rem' }}
                title="Scan QR code with any phone"
              >
                <QrCode size={16} color="#10b981" />
                {showQr ? 'Hide QR Code' : '📱 Mobile QR Code'}
              </button>
              <button
                onClick={onOpenArchitecture}
                className="btn btn-outline"
                style={{ fontSize: '0.85rem' }}
              >
                <BookOpen size={16} color="#10b981" />
                Explain Architecture
              </button>
              <a
                href={liveUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
                style={{ fontSize: '0.85rem' }}
              >
                <ExternalLink size={16} />
                Open Live Site
              </a>
              {onDeleteDeployment && (
                isConfirmingDelete ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      onClick={async () => {
                        setIsDeleting(true);
                        try {
                          await onDeleteDeployment();
                        } finally {
                          setIsDeleting(false);
                          setIsConfirmingDelete(false);
                        }
                      }}
                      disabled={isDeleting}
                      className="btn"
                      style={{
                        fontSize: '0.85rem',
                        color: '#ffffff',
                        backgroundColor: '#dc2626',
                        borderColor: '#ef4444',
                        fontWeight: 700,
                        boxShadow: '0 0 10px rgba(220, 38, 38, 0.5)',
                      }}
                    >
                      {isDeleting ? '⏳ Deleting...' : '⚠️ Confirm Delete?'}
                    </button>
                    <button
                      onClick={() => setIsConfirmingDelete(false)}
                      disabled={isDeleting}
                      className="btn btn-outline"
                      style={{ fontSize: '0.85rem', padding: '6px 10px' }}
                      title="Cancel"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsConfirmingDelete(true)}
                    className="btn btn-outline"
                    style={{
                      fontSize: '0.85rem',
                      color: '#f87171',
                      borderColor: 'rgba(239, 68, 68, 0.4)',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    }}
                    title="Stop server, tear down tunnel, and delete deployment"
                  >
                    <Trash2 size={16} color="#f87171" />
                    Delete Deployment
                  </button>
                )
              )}
            </div>
          </div>

          {/* Prominent Worldwide Public Link Box */}
          <div
            style={{
              background: '#0d131f',
              border: '1px solid #059669',
              borderRadius: '10px',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
              <Globe size={18} color="#34d399" style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                  Worldwide Public HTTPS Link (Share with Anyone)
                </div>
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: '#10b981',
                    fontFamily: 'monospace',
                    fontSize: '1rem',
                    fontWeight: 700,
                    wordBreak: 'break-all',
                    textDecoration: 'underline',
                  }}
                >
                  {liveUrl}
                </a>
              </div>
            </div>

            <button
              onClick={handleCopy}
              className="btn"
              style={{
                fontSize: '0.85rem',
                background: copied ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                color: copied ? '#34d399' : '#f8fafc',
                border: copied ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                transition: 'all 0.2s ease',
              }}
            >
              {copied ? <Check size={16} color="#34d399" /> : <Copy size={16} />}
              {copied ? 'Copied to Clipboard!' : 'Copy Link'}
            </button>
          </div>

          {/* Expandable Mobile QR Code Preview */}
          {showQr && (
            <div
              style={{
                background: '#0d131f',
                border: '1px solid #059669',
                borderRadius: '10px',
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '24px',
                flexWrap: 'wrap',
              }}
            >
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(liveUrl)}`}
                alt="Live Site QR Code"
                style={{
                  width: '140px',
                  height: '140px',
                  borderRadius: '8px',
                  background: '#ffffff',
                  padding: '6px',
                }}
              />
              <div style={{ maxWidth: '420px' }}>
                <h4 style={{ color: '#ffffff', fontSize: '1rem', fontWeight: 700, marginBottom: '6px' }}>
                  📱 Scan with Any Mobile Device
                </h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: '8px' }}>
                  Point your smartphone camera at this QR code to instantly load your Laravel application on iOS or Android without typing the URL.
                </p>
                <span style={{ fontSize: '0.75rem', color: '#10b981', fontFamily: 'monospace' }}>
                  {liveUrl}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Terminal Window */}
      <div className="terminal-window">
        <div className="terminal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="terminal-dots">
              <span className="dot dot-red" />
              <span className="dot dot-yellow" />
              <span className="dot dot-green" />
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              orchestrator-session: {deploymentId} ({liveUrl || `${subdomain}.trycloudflare.com`})
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem' }}>
            {!isComplete && !hasError ? (
              <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Loader2 size={12} className="spinning" />
                STREAMING BUILD LOGS
              </span>
            ) : hasError ? (
              <span style={{ color: '#f87171', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                ● DEPLOYMENT FAILED
              </span>
            ) : (
              <span style={{ color: '#34d399', fontWeight: 600 }}>READY</span>
            )}
          </div>
        </div>

        <div className="terminal-body" ref={terminalBodyRef}>
          {events.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Connecting to live orchestrator event stream...
            </div>
          )}

          {events.map((evt, idx) => {
            let stageColor = '#38bdf8'; // cyan
            if (evt.stage === 'BUILD') stageColor = '#fbbf24';
            if (evt.stage === 'RUN') stageColor = '#a78bfa';
            if (evt.stage === 'ROUTING') stageColor = '#34d399';
            if (evt.stage === 'SABLIER') stageColor = '#f472b6';
            if (evt.stage === 'ERROR') stageColor = '#f87171';

            return (
              <div key={idx} style={{ marginBottom: '4px', wordBreak: 'break-word' }}>
                <span style={{ color: 'var(--text-muted)', marginRight: '10px' }}>
                  {evt.timestamp.slice(11, 19)}
                </span>
                <span
                  style={{
                    color: stageColor,
                    fontWeight: 600,
                    marginRight: '8px',
                    display: 'inline-block',
                    minWidth: '75px',
                  }}
                >
                  [{evt.stage}]
                </span>
                <span style={{ color: evt.level === 'ERROR' ? '#f87171' : '#e2e8f0' }}>
                  {evt.message}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
