import React, { useState } from 'react';
import { Database, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';

export interface MySQLConfig {
  db_name: string;
  db_user: string;
  db_password: string;
  run_seeder: boolean;
  seeder_class: string;
}

interface MySQLConfigPanelProps {
  projectId: string;
  config: MySQLConfig;
  onChange: (config: MySQLConfig) => void;
}

export const MySQLConfigPanel: React.FC<MySQLConfigPanelProps> = ({
  projectId,
  config,
  onChange,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const defaultDbName = `db_${projectId.slice(0, 10)}`;

  const update = (partial: Partial<MySQLConfig>) => {
    onChange({ ...config, ...partial });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 13px',
    borderRadius: '8px',
    border: '1px solid #1f2937',
    background: '#0d1320',
    color: '#e2e8f0',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.85rem',
    outline: 'none',
    transition: 'border-color 0.15s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#64748b',
    marginBottom: '5px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };

  // Summary line shown when collapsed
  const summary = `${config.db_name || defaultDbName} · user: ${config.db_user || 'root'}${config.run_seeder ? ` · seeder: ${config.seeder_class || 'DatabaseSeeder'}` : ''}`;

  return (
    <div
      style={{
        border: '1px solid #1f2937',
        borderRadius: '12px',
        overflow: 'hidden',
        background: '#0b0f19',
      }}
    >
      {/* Header toggle */}
      <button
        type="button"
        id="mysql-config-toggle"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '13px 18px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#e2e8f0',
          textAlign: 'left',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '7px',
              background: '#064e3b',
              border: '1px solid #065f46',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Database size={15} color="#10b981" />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ffffff' }}>
              ⚙️ MySQL Database Configuration
            </div>
            {!expanded && (
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'var(--font-mono)', marginTop: '1px' }}>
                {summary}
              </div>
            )}
          </div>
        </div>
        <div style={{ color: '#10b981', flexShrink: 0 }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Expanded configuration fields */}
      {expanded && (
        <div
          style={{
            padding: '16px 18px 20px',
            borderTop: '1px solid #1a2334',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Row 1: DB Name + DB User */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Database Name</label>
              <input
                id="mysql-db-name"
                type="text"
                placeholder={defaultDbName}
                value={config.db_name}
                onChange={e => update({ db_name: e.target.value })}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = '#10b981')}
                onBlur={e => (e.target.style.borderColor = '#1f2937')}
              />
              <span style={{ fontSize: '0.7rem', color: '#475569', marginTop: '4px', display: 'block' }}>
                Leave blank to auto-generate
              </span>
            </div>
            <div>
              <label style={labelStyle}>Database User</label>
              <input
                id="mysql-db-user"
                type="text"
                placeholder="root"
                value={config.db_user}
                onChange={e => update({ db_user: e.target.value })}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = '#10b981')}
                onBlur={e => (e.target.style.borderColor = '#1f2937')}
              />
            </div>
          </div>

          {/* Row 2: Password */}
          <div>
            <label style={labelStyle}>Database Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="mysql-db-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Leave empty for Termux MariaDB default (no password)"
                value={config.db_password}
                onChange={e => update({ db_password: e.target.value })}
                style={{ ...inputStyle, paddingRight: '42px' }}
                onFocus={e => (e.target.style.borderColor = '#10b981')}
                onBlur={e => (e.target.style.borderColor = '#1f2937')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Row 3: Run Seeder toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              background: '#0d1320',
              borderRadius: '8px',
              border: '1px solid #1f2937',
            }}
          >
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0' }}>
                🌱 Run Database Seeder
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                Runs <code style={{ color: '#10b981', fontFamily: 'var(--font-mono)' }}>php artisan db:seed</code> after migrations
              </div>
            </div>
            <button
              id="mysql-seeder-toggle"
              type="button"
              onClick={() => update({ run_seeder: !config.run_seeder })}
              style={{
                width: '44px',
                height: '24px',
                borderRadius: '12px',
                background: config.run_seeder ? '#10b981' : '#1f2937',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
              title={config.run_seeder ? 'Disable seeder' : 'Enable seeder'}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '3px',
                  left: config.run_seeder ? '23px' : '3px',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: '#ffffff',
                  transition: 'left 0.2s',
                }}
              />
            </button>
          </div>

          {/* Row 4: Seeder class (only when seeder is enabled) */}
          {config.run_seeder && (
            <div>
              <label style={labelStyle}>Seeder Class</label>
              <input
                id="mysql-seeder-class"
                type="text"
                placeholder="DatabaseSeeder"
                value={config.seeder_class}
                onChange={e => update({ seeder_class: e.target.value })}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = '#10b981')}
                onBlur={e => (e.target.style.borderColor = '#1f2937')}
              />
              <span style={{ fontSize: '0.7rem', color: '#475569', marginTop: '4px', display: 'block' }}>
                e.g. <code style={{ color: '#10b981', fontFamily: 'var(--font-mono)' }}>DatabaseSeeder</code>,{' '}
                <code style={{ color: '#10b981', fontFamily: 'var(--font-mono)' }}>UserSeeder</code>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
