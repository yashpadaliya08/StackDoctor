import React, { useState, useEffect } from 'react';
import { KeyRound, ShieldCheck, Plus, Trash2, Eye, EyeOff, Sparkles, Database } from 'lucide-react';

export interface EnvVarItem {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  showValue: boolean;
}

interface EnvironmentVariablesEditorProps {
  initialEnv?: Record<string, string>;
  stack?: string;
  onChange: (env: Record<string, string>) => void;
}

function generateRandomSecret(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
  let result = '';
  const cryptoObj = window.crypto || (window as any).msCrypto;
  if (cryptoObj && cryptoObj.getRandomValues) {
    const values = new Uint8Array(length);
    cryptoObj.getRandomValues(values);
    for (let i = 0; i < length; i++) {
      result += chars[values[i] % chars.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  return result;
}

export const EnvironmentVariablesEditor: React.FC<EnvironmentVariablesEditorProps> = ({
  initialEnv = {},
  stack = 'general',
  onChange,
}) => {
  const [items, setItems] = useState<EnvVarItem[]>(() => {
    // Filter out internal PORT/NODE_ENV so they don't override dynamic phone port assignment
    const entries = Object.entries(initialEnv).filter(
      ([k]) => k.toUpperCase() !== 'PORT' && k.toUpperCase() !== 'NODE_ENV'
    );
    if (entries.length === 0) {
      if (stack === 'node') {
        return [
          {
            id: '1',
            key: 'mongoUrl',
            value: 'mongodb+srv://username:password@cluster0.mongodb.net/todolist?retryWrites=true&w=majority',
            isSecret: true,
            showValue: false,
          },
        ];
      }
      return [];
    }
    return entries.map(([k, v], idx) => {
      const isSec = /secret|key|password|pass|token|mongo|uri|url/i.test(k);
      return {
        id: String(idx + 1),
        key: k,
        value: v,
        isSecret: isSec,
        showValue: !isSec,
      };
    });
  });

  // Keep parent in sync
  useEffect(() => {
    const dict: Record<string, string> = {};
    items.forEach((item) => {
      const trimmedKey = item.key.trim();
      if (trimmedKey && trimmedKey.toUpperCase() !== 'PORT' && trimmedKey.toUpperCase() !== 'NODE_ENV') {
        dict[trimmedKey] = item.value;
      }
    });
    onChange(dict);
  }, [items]);

  const handleKeyChange = (id: string, newKey: string) => {
    const trimmed = newKey.trim();
    // Auto-detect if user pasted a connection URL into the KEY field
    if (
      trimmed.startsWith('mongodb://') ||
      trimmed.startsWith('mongodb+srv://') ||
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('postgres://') ||
      trimmed.startsWith('mysql://')
    ) {
      const suggestedKey = trimmed.startsWith('mongo')
        ? stack === 'node'
          ? 'mongoUrl'
          : 'MONGODB_URI'
        : 'DATABASE_URL';
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                key: suggestedKey,
                value: trimmed,
                isSecret: true,
                showValue: true,
              }
            : item
        )
      );
      return;
    }

    // Auto-detect if user pasted a KEY=VALUE line into the KEY field
    if (trimmed.includes('=') && !trimmed.startsWith('=')) {
      const [pk, ...pv] = trimmed.split('=');
      const val = pv.join('=');
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                key: pk.trim(),
                value: val.trim(),
                isSecret: /secret|key|password|pass|token|mongo|uri|url/i.test(pk),
                showValue: true,
              }
            : item
        )
      );
      return;
    }

    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const isSec = /secret|key|password|pass|token|mongo|uri|url/i.test(newKey);
          return { ...item, key: newKey, isSecret: isSec };
        }
        return item;
      })
    );
  };

  const handleValueChange = (id: string, newValue: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, value: newValue } : item)));
  };

  const handleToggleVisibility = (id: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, showValue: !item.showValue } : item)));
  };

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleAddCustom = () => {
    const newItem: EnvVarItem = {
      id: Math.random().toString(36).substring(2, 9),
      key: '',
      value: '',
      isSecret: false,
      showValue: true,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleAddMongoPreset = () => {
    // Check if mongoUrl or MONGODB_URI exists
    const hasMongo = items.some((item) => /^mongo/i.test(item.key));
    if (hasMongo) {
      setItems((prev) =>
        prev.map((item) =>
          /^mongo/i.test(item.key)
            ? {
                ...item,
                value: 'mongodb+srv://username:password@cluster0.mongodb.net/todolist?retryWrites=true&w=majority',
                showValue: true,
              }
            : item
        )
      );
    } else {
      const newItem: EnvVarItem = {
        id: Math.random().toString(36).substring(2, 9),
        key: stack === 'node' ? 'mongoUrl' : 'MONGODB_URI',
        value: 'mongodb+srv://username:password@cluster0.mongodb.net/todolist?retryWrites=true&w=majority',
        isSecret: true,
        showValue: true,
      };
      setItems((prev) => [newItem, ...prev]);
    }
  };

  const handleAddJwtPreset = () => {
    const newItem: EnvVarItem = {
      id: Math.random().toString(36).substring(2, 9),
      key: 'JWT_SECRET',
      value: generateRandomSecret(32),
      isSecret: true,
      showValue: false,
    };
    setItems((prev) => [...prev, newItem]);
  };

  return (
    <div
      style={{
        background: '#0d131f',
        border: '1px solid #1f2937',
        borderRadius: '8px',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              padding: '6px',
              borderRadius: '6px',
              background: '#064e3b',
              color: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <KeyRound size={16} />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f3f4f6', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Environment & Secrets</span>
              <span
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: '#111827',
                  border: '1px solid #374151',
                  color: '#9ca3af',
                }}
              >
                {items.length} {items.length === 1 ? 'VAR' : 'VARS'}
              </span>
            </div>
            <div style={{ fontSize: '0.68rem', color: '#9ca3af' }}>Injected into live runtime .env before start</div>
          </div>
        </div>

        {/* Security badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.65rem',
            fontWeight: 600,
            color: '#10b981',
            background: '#064e3b',
            border: '1px solid #047857',
            padding: '3px 8px',
            borderRadius: '4px',
          }}
        >
          <ShieldCheck size={13} />
          <span>SAFE: ZERO GIT LEAKAGE</span>
        </div>
      </div>

      {/* Quick Template Presets */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleAddMongoPreset}
          style={{
            fontSize: '0.7rem',
            fontWeight: 600,
            padding: '4px 8px',
            background: '#111827',
            border: '1px solid #374151',
            color: '#34d399',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <Database size={12} />
          <span>+ MongoDB Atlas URI</span>
        </button>

        <button
          type="button"
          onClick={handleAddJwtPreset}
          style={{
            fontSize: '0.7rem',
            fontWeight: 600,
            padding: '4px 8px',
            background: '#111827',
            border: '1px solid #374151',
            color: '#60a5fa',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <Sparkles size={12} />
          <span>+ JWT Secret</span>
        </button>

        <button
          type="button"
          onClick={handleAddCustom}
          style={{
            fontSize: '0.7rem',
            fontWeight: 600,
            padding: '4px 8px',
            background: '#111827',
            border: '1px solid #374151',
            color: '#d1d5db',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginLeft: 'auto',
          }}
        >
          <Plus size={12} />
          <span>Add Variable</span>
        </button>
      </div>

      {/* Items List */}
      {items.length === 0 ? (
        <div
          style={{
            padding: '14px',
            textAlign: 'center',
            background: '#111827',
            border: '1px dashed #374151',
            borderRadius: '6px',
            fontSize: '0.75rem',
            color: '#9ca3af',
          }}
        >
          No environment variables configured. Click "+ MongoDB Atlas URI" or "Add Variable" to inject secrets.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#111827',
                border: '1px solid #1f2937',
                borderRadius: '6px',
                padding: '6px 8px',
              }}
            >
              {/* KEY input */}
              <input
                type="text"
                placeholder="VARIABLE_NAME"
                value={item.key}
                onChange={(e) => handleKeyChange(item.id, e.target.value)}
                style={{
                  width: '130px',
                  minWidth: '100px',
                  background: '#0d131f',
                  border: '1px solid #374151',
                  borderRadius: '4px',
                  padding: '5px 8px',
                  color: '#10b981',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  outline: 'none',
                }}
              />

              <span style={{ color: '#6b7280', fontWeight: 700 }}>=</span>

              {/* VALUE input container with visibility toggle */}
              <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                <input
                  type={item.showValue ? 'text' : 'password'}
                  placeholder="value (e.g. mongodb+srv://...)"
                  value={item.value}
                  onChange={(e) => handleValueChange(item.id, e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0d131f',
                    border: '1px solid #374151',
                    borderRadius: '4px',
                    padding: '5px 28px 5px 8px',
                    color: '#f3f4f6',
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleToggleVisibility(item.id)}
                  title={item.showValue ? 'Hide Secret' : 'Show Secret'}
                  style={{
                    position: 'absolute',
                    right: '6px',
                    background: 'transparent',
                    border: 'none',
                    color: '#9ca3af',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 0,
                  }}
                >
                  {item.showValue ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              {/* Delete button */}
              <button
                type="button"
                onClick={() => handleDelete(item.id)}
                title="Delete variable"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ef4444',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '4px',
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Helper explanatory note */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '6px',
          fontSize: '0.67rem',
          color: '#9ca3af',
          background: '#0b0f17',
          padding: '6px 10px',
          borderRadius: '4px',
          borderLeft: '3px solid #10b981',
        }}
      >
        <span>
          💡 <strong>Tip for MongoDB:</strong> Since Android libc cannot run local <code>mongod</code>, connect to a free{' '}
          <strong style={{ color: '#34d399' }}>MongoDB Atlas Cloud</strong> cluster by pasting its connection string above.
        </span>
      </div>
    </div>
  );
};
