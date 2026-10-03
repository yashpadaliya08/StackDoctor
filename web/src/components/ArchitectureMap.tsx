import React, { useState } from 'react';
import {
  Globe,
  ShieldCheck,
  Zap,
  Server,
  Cpu,
  Layers,
  Database,
  HardDrive,
  Info,
  X,
} from 'lucide-react';

interface ComponentDetail {
  id: string;
  name: string;
  category: string;
  role: string;
  whyNeeded: string;
  howConfigured: string;
  icon: React.ReactNode;
}

const ARCHITECTURE_NODES: ComponentDetail[] = [
  {
    id: 'client',
    name: 'Browser / Client',
    category: 'Traffic Entry',
    role: 'Sends encrypted HTTPS requests to your public domain.',
    whyNeeded: 'Students, professors, or recruiters viewing your live project on their laptops or mobile phones.',
    howConfigured: 'Routed via DNS to your unique custom domain (https://<subdomain>.studentapp.dev).',
    icon: <Globe size={24} color="#38bdf8" />,
  },
  {
    id: 'caddy',
    name: 'Caddy Reverse Proxy',
    category: 'Edge & SSL Layer',
    role: 'Terminates HTTPS/TLS traffic and forwards requests to internal container ports.',
    whyNeeded: 'Handles Let’s Encrypt certificates automatically so your site gets a valid green padlock without manual certificate renewals.',
    howConfigured: 'Laravel Doctor dynamically registers your subdomain via Caddy’s REST API without restarting the server.',
    icon: <ShieldCheck size={24} color="#34d399" />,
  },
  {
    id: 'sablier',
    name: 'Sablier Scale-to-Zero',
    category: 'Cost & Resource Protection',
    role: 'Monitors incoming HTTP requests and puts idle containers to sleep.',
    whyNeeded: 'Student demos only get traffic during evaluations or interviews. Keeping 100 containers running 24/7 wastes RAM. Sablier stops the container when idle and wakes it up in < 2 seconds.',
    howConfigured: 'Configured as reverse proxy middleware with a 15-minute idle timeout.',
    icon: <Zap size={24} color="#f472b6" />,
  },
  {
    id: 'nginx',
    name: 'Nginx Web Server',
    category: 'Web Server',
    role: 'Serves static assets (CSS, JS, images) and routes dynamic PHP requests to PHP-FPM.',
    whyNeeded: 'Crucial for security: locks the document root strictly to `/var/www/html/public` so hackers cannot access your `.env` file or source code.',
    howConfigured: 'Pre-configured in our `serversideup/php-fpm-nginx` image with try_files $uri $uri/ /index.php?$query_string.',
    icon: <Server size={24} color="#fbbf24" />,
  },
  {
    id: 'php-fpm',
    name: 'PHP-FPM Process Engine',
    category: 'Runtime',
    role: 'FastCGI Process Manager executing your PHP 8.2 / 8.3 application code.',
    whyNeeded: 'PHP is not an HTTP server by itself. PHP-FPM manages persistent worker pools to execute Laravel scripts with maximum performance.',
    howConfigured: 'Hardened php.ini with high-risk system functions disabled and memory limits enforced.',
    icon: <Cpu size={24} color="#a78bfa" />,
  },
  {
    id: 'laravel',
    name: 'Laravel 11 Application',
    category: 'Framework Core',
    role: 'Executes routing, authentication, Eloquent ORM, and renders Blade / API views.',
    whyNeeded: 'Your application logic, models, controllers, and business rules.',
    howConfigured: 'Booted with production APP_KEY, optimized config cache, and compiled Vite assets.',
    icon: <Layers size={24} color="#f87171" />,
  },
  {
    id: 'database',
    name: 'Managed Database (MySQL / SQLite)',
    category: 'Data Persistence',
    role: 'Stores application records, user accounts, and relational data.',
    whyNeeded: 'Holds your persistent tables and relationships.',
    howConfigured: 'Multi-tenant isolated database schema and credentials generated automatically, with migrations executed on startup.',
    icon: <Database size={24} color="#34d399" />,
  },
  {
    id: 'storage',
    name: 'Persistent Volume Mount',
    category: 'File System',
    role: 'Preserves uploaded files, avatar pictures, and logs on the host disk.',
    whyNeeded: 'Without persistent volume mounting, Docker containers are ephemeral: restarting the container would erase all uploaded student avatars and SQLite files!',
    howConfigured: 'Mounted directly to `/var/www/html/storage` with `storage:link` automatically linked.',
    icon: <HardDrive size={24} color="#38bdf8" />,
  },
];

export const ArchitectureMap: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [selectedNode, setSelectedNode] = useState<ComponentDetail>(ARCHITECTURE_NODES[0]);

  return (
    <div className="glass-card" style={{ padding: '28px', position: 'relative' }}>
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          background: 'rgba(255, 255, 255, 0.1)',
          border: 'none',
          color: '#ffffff',
          borderRadius: '50%',
          width: '32px',
          height: '32px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={18} />
      </button>

      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={22} color="#10b981" />
          How Your Laravel Project is Deployed
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Click on any architectural component below to learn what it does and why it exists.
        </p>
      </div>

      {/* Interactive Diagram Pipeline Nodes */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          marginBottom: '28px',
        }}
      >
        {ARCHITECTURE_NODES.map((node, index) => {
          const isSelected = selectedNode.id === node.id;
          return (
            <div
              key={node.id}
              onClick={() => setSelectedNode(node)}
              style={{
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                background: isSelected ? '#064e3b' : '#0d131f',
                border: isSelected ? '1.5px solid #10b981' : '1px solid #1f2937',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '8px',
                  background: '#162032',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {node.icon}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  STEP {index + 1}
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                  {node.name}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Node Deep Dive Explanation */}
      <div
        style={{
          padding: '24px',
          borderRadius: 'var(--radius-md)',
          background: '#0d131f',
          border: '1px solid #059669',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              padding: '12px',
              borderRadius: '8px',
              background: '#064e3b',
            }}
          >
            {selectedNode.icon}
          </div>
          <div>
            <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>
              {selectedNode.category}
            </span>
            <h3 style={{ fontSize: '1.25rem', marginTop: '2px' }}>{selectedNode.name}</h3>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          <div>
            <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              WHAT IT DOES
            </h4>
            <p style={{ fontSize: '0.9rem', color: '#e2e8f0', lineHeight: 1.5 }}>
              {selectedNode.role}
            </p>
          </div>

          <div>
            <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              WHY IT MATTERS FOR STUDENTS
            </h4>
            <p style={{ fontSize: '0.9rem', color: '#e2e8f0', lineHeight: 1.5 }}>
              {selectedNode.whyNeeded}
            </p>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #1e293b', paddingTop: '14px' }}>
          <h4 style={{ fontSize: '0.85rem', color: '#10b981', marginBottom: '4px' }}>
            HOW LARAVEL DOCTOR CONFIGURED THIS:
          </h4>
          <p style={{ fontSize: '0.88rem', color: '#94a3b8', lineHeight: 1.5 }}>
            {selectedNode.howConfigured}
          </p>
        </div>
      </div>
    </div>
  );
};
