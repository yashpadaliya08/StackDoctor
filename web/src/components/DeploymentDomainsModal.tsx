import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { fetchCustomDomains, addCustomDomain, verifyCustomDomain, removeCustomDomain, CustomDomain } from '../api';

interface Props {
  projectId: string;
  projectName: string;
  tunnelUrl?: string;
  onClose: () => void;
}

export const DeploymentDomainsModal: React.FC<Props> = ({ projectId, projectName, tunnelUrl, onClose }) => {
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [verifyingDomain, setVerifyingDomain] = useState<string | null>(null);
  const [confirmRemoveDomain, setConfirmRemoveDomain] = useState<string | null>(null);
  const [isDeletingDomain, setIsDeletingDomain] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Lock body scroll while modal is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    loadDomains();
  }, [projectId]);

  const loadDomains = async () => {
    setIsLoading(true);
    try {
      const res = await fetchCustomDomains(projectId);
      setDomains(res.domains || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    const domain = newDomain.trim().toLowerCase();
    if (!domain || isAdding) return;

    setIsAdding(true);
    setStatusMsg(null);
    try {
      await addCustomDomain(projectId, domain, tunnelUrl);
      setStatusMsg({ type: 'success', text: `Domain '${domain}' added! Configure your DNS CNAME below.` });
      setNewDomain('');
      await loadDomains();
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message || 'Failed to add domain' });
    } finally {
      setIsAdding(false);
    }
  };

  const handleVerify = async (domain: string) => {
    setVerifyingDomain(domain);
    setStatusMsg(null);
    try {
      const res = await verifyCustomDomain(projectId, domain);
      if (res.status === 'VERIFIED') {
        setStatusMsg({ type: 'success', text: `✔ DNS verified! SSL is secured and active for ${domain}.` });
      } else {
        setStatusMsg({ type: 'error', text: `DNS verification pending for ${domain}. Check that your CNAME points to the target.` });
      }
      await loadDomains();
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message || 'Verification error' });
    } finally {
      setVerifyingDomain(null);
    }
  };

  const handleRemove = async (domain: string) => {
    if (confirmRemoveDomain !== domain) {
      setConfirmRemoveDomain(domain);
      setTimeout(() => {
        setConfirmRemoveDomain((curr) => (curr === domain ? null : curr));
      }, 4000);
      return;
    }

    setIsDeletingDomain(domain);
    setConfirmRemoveDomain(null);
    setStatusMsg(null);
    try {
      await removeCustomDomain(projectId, domain);
      setStatusMsg({ type: 'success', text: `Domain '${domain}' removed successfully.` });
      await loadDomains();
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message || 'Failed to remove domain' });
    } finally {
      setIsDeletingDomain(null);
    }
  };

  const targetHost = (tunnelUrl || 'edge.stackdoctor.dev')
    .replace('https://', '')
    .replace('http://', '')
    .split('/')[0];

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
          maxWidth: '720px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 30px rgba(16, 185, 129, 0.1)',
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
              <span>🌐</span> Custom Domains & Edge SSL
              <span
                style={{
                  backgroundColor: '#059669',
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
              Bind your custom apex or subdomain with automatic Cloudflare Edge SSL provisioning.
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

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {statusMsg && (
            <div
              style={{
                background: statusMsg.type === 'success' ? '#064e3b' : '#7f1d1d',
                border: statusMsg.type === 'success' ? '1px solid #059669' : '1px solid #dc2626',
                color: statusMsg.type === 'success' ? '#34d399' : '#fca5a5',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                marginBottom: '16px',
              }}
            >
              {statusMsg.text}
            </div>
          )}

          {/* Add Domain Input */}
          <form onSubmit={handleAddDomain} style={{ marginBottom: '20px' }}>
            <label style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
              Add Custom Domain / Subdomain
            </label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <input
                type="text"
                placeholder="e.g. cars.myclient.com or api.swiftride.dev"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                style={{
                  flex: 1,
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                }}
              />
              <button
                type="submit"
                disabled={isAdding || !newDomain.trim()}
                style={{
                  background: '#059669',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {isAdding ? 'Adding...' : '+ Add Domain'}
              </button>
            </div>
          </form>

          {/* DNS Guidance Box */}
          <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px', marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
              DNS Configuration Instructions
            </div>
            <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.6 }}>
              In your DNS provider (Cloudflare, GoDaddy, Namecheap, Route 53), add a <strong>CNAME</strong> record:
            </div>
            <div
              style={{
                marginTop: '8px',
                background: '#1e293b',
                padding: '8px 12px',
                borderRadius: '6px',
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#34d399',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>Type: <strong>CNAME</strong></span>
              <span>Target: <strong>{targetHost}</strong></span>
              <span>TTL: <strong>Auto</strong></span>
            </div>
          </div>

          {/* Domain List */}
          <div>
            <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '10px' }}>
              Configured Domains ({domains.length})
            </div>

            {isLoading ? (
              <div style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>Loading domains...</div>
            ) : domains.length === 0 ? (
              <div style={{ color: '#94a3b8', textAlign: 'center', padding: '20px', background: '#1e293b22', borderRadius: '8px' }}>
                No custom domains added yet. Enter a domain above to get started.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {domains.map((dom) => {
                  const isVerified = dom.status === 'ACTIVE';
                  return (
                    <div
                      key={dom.domain}
                      style={{
                        background: '#1e293b44',
                        border: isVerified ? '1px solid #059669' : '1px solid #334155',
                        borderRadius: '8px',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: '13px' }}>{dom.domain}</span>
                          <span
                            style={{
                              background: isVerified ? '#064e3b' : '#854d0e',
                              color: isVerified ? '#34d399' : '#fde047',
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            {isVerified ? '🔒 SSL SECURED' : '⏳ PENDING DNS'}
                          </span>
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                          CNAME Target: <code style={{ color: '#38bdf8' }}>{dom.target_cname}</code> {dom.resolved_ip && `• IP: ${dom.resolved_ip}`}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => handleVerify(dom.domain)}
                          disabled={verifyingDomain === dom.domain}
                          style={{
                            background: '#1e293b',
                            border: '1px solid #475569',
                            color: '#38bdf8',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {verifyingDomain === dom.domain ? 'Checking...' : '🔍 Verify DNS'}
                        </button>
                        <button
                          onClick={() => handleRemove(dom.domain)}
                          disabled={isDeletingDomain === dom.domain}
                          style={{
                            background: confirmRemoveDomain === dom.domain ? '#991b1b' : '#1e293b',
                            border: confirmRemoveDomain === dom.domain ? '1px solid #ef4444' : '1px solid #475569',
                            color: confirmRemoveDomain === dom.domain ? '#fecaca' : '#f87171',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.15s ease',
                          }}
                          title={confirmRemoveDomain === dom.domain ? 'Click again to confirm deletion' : 'Delete custom domain'}
                        >
                          {isDeletingDomain === dom.domain
                            ? 'Deleting...'
                            : confirmRemoveDomain === dom.domain
                            ? 'Confirm Delete?'
                            : '🗑️ Delete'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
