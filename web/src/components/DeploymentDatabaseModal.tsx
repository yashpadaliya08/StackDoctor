import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  fetchDbTables,
  fetchDbTableData,
  executeSqlQuery,
  syncLocalDatabase,
  importSqlDump,
  getExportSqlUrl,
  DbTableInfo,
  DbTableDataResponse,
  SqlQueryResponse,
  SyncLocalDbResponse,
} from '../api';

interface Props {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

export const DeploymentDatabaseModal: React.FC<Props> = ({ projectId, projectName, onClose }) => {
  const [databaseName, setDatabaseName] = useState<string>('');
  const [tables, setTables] = useState<DbTableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<DbTableDataResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'tables' | 'query' | 'sync'>('tables');
  const [sqlQuery, setSqlQuery] = useState<string>('SELECT * FROM users LIMIT 10;');
  const [queryResult, setQueryResult] = useState<SqlQueryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [queryRunning, setQueryRunning] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncLocalDbResponse | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Lock body scroll while modal is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    loadTables();
  }, [projectId]);

  const loadTables = async () => {
    setLoading(true);
    try {
      const res = await fetchDbTables(projectId);
      setDatabaseName(res.database);
      setTables(res.tables);
      if (res.tables.length > 0 && !selectedTable) {
        loadTable(res.tables[0].name, 1);
      }
    } catch (e) {
      console.error('Failed to load DB tables:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadTable = async (tableName: string, targetPage: number = 1) => {
    setSelectedTable(tableName);
    setPage(targetPage);
    setTableLoading(true);
    try {
      const res = await fetchDbTableData(projectId, tableName, targetPage, 50);
      setTableData(res);
    } catch (e) {
      console.error('Failed to fetch table data:', e);
    } finally {
      setTableLoading(false);
    }
  };

  const handleRunQuery = async () => {
    if (!sqlQuery.trim() || queryRunning) return;
    setQueryRunning(true);
    try {
      const res = await executeSqlQuery(projectId, sqlQuery);
      setQueryResult(res);
    } catch (e: any) {
      setQueryResult({
        success: false,
        error: e.message || 'Query failed',
        execution_time_sec: 0,
      });
    } finally {
      setQueryRunning(false);
    }
  };

  const handleSyncLocal = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await syncLocalDatabase(projectId);
      setSyncResult(res);
      await loadTables();
    } catch (e: any) {
      setSyncResult({
        status: 'ERROR',
        message: e.message || 'Failed to sync local data',
        synced_sources: [],
        total_records: 0,
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleImportFile = async () => {
    if (!selectedFile || importing) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await importSqlDump(projectId, selectedFile);
      setImportResult(res);
      setSelectedFile(null);
      await loadTables();
    } catch (e: any) {
      setImportResult({
        success: false,
        error: e.message || 'Failed to import SQL dump',
      });
    } finally {
      setImporting(false);
    }
  };

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
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '1100px',
          height: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #21262d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#161b22',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.4rem' }}>🗄️</span>
            <div>
              <div style={{ fontWeight: 700, color: '#f0f6fc', fontSize: '1rem' }}>
                MariaDB Database Viewer — {projectName}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#8b949e' }}>
                Schema: <code style={{ color: '#58a6ff' }}>{databaseName || 'Loading...'}</code> | Port 3306 (Isolated)
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setActiveTab('tables')}
                style={{
                  background: activeTab === 'tables' ? '#1f6feb' : '#21262d',
                  color: '#fff',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                📊 Table Browser
              </button>
              <button
                onClick={() => setActiveTab('query')}
                style={{
                  background: activeTab === 'query' ? '#1f6feb' : '#21262d',
                  color: '#fff',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ⚡ SQL Query Editor
              </button>
              <button
                onClick={() => setActiveTab('sync')}
                style={{
                  background: activeTab === 'sync' ? '#1f6feb' : '#21262d',
                  color: '#fff',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                🔄 Sync & Backups
              </button>
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#8b949e',
                fontSize: '1.2rem',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content Body */}
        {activeTab === 'tables' ? (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Sidebar Table List */}
            <div
              style={{
                width: '240px',
                borderRight: '1px solid #21262d',
                background: '#0d1117',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #21262d',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  color: '#8b949e',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>TABLES ({tables.length})</span>
                <button
                  onClick={loadTables}
                  style={{ background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: '0.75rem' }}
                >
                  🔄
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading ? (
                  <div style={{ padding: '16px', color: '#8b949e', fontSize: '0.8rem' }}>Scanning MariaDB...</div>
                ) : tables.length === 0 ? (
                  <div style={{ padding: '16px', color: '#6e7681', fontSize: '0.8rem' }}>No tables found.</div>
                ) : (
                  tables.map((t) => (
                    <div
                      key={t.name}
                      onClick={() => loadTable(t.name, 1)}
                      style={{
                        padding: '10px 16px',
                        borderBottom: '1px solid #161b22',
                        cursor: 'pointer',
                        background: selectedTable === t.name ? '#161b22' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span
                        style={{
                          color: selectedTable === t.name ? '#58a6ff' : '#c9d1d9',
                          fontWeight: selectedTable === t.name ? 600 : 400,
                          fontSize: '0.82rem',
                        }}
                      >
                        {t.name}
                      </span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          background: '#21262d',
                          color: '#8b949e',
                          padding: '2px 6px',
                          borderRadius: '10px',
                        }}
                      >
                        {t.rows}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Table Rows Viewer */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#090d13', overflow: 'hidden' }}>
              {selectedTable && (
                <div
                  style={{
                    padding: '10px 20px',
                    borderBottom: '1px solid #21262d',
                    background: '#161b22',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#f0f6fc', fontSize: '0.9rem' }}>
                    Table: <span style={{ color: '#58a6ff' }}>{selectedTable}</span>
                    <span style={{ color: '#8b949e', fontSize: '0.75rem', marginLeft: '12px' }}>
                      ({tableData?.total_rows || 0} total rows)
                    </span>
                  </div>

                  {/* Pagination */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => loadTable(selectedTable, Math.max(1, page - 1))}
                      disabled={page <= 1 || tableLoading}
                      style={{
                        background: '#21262d',
                        border: '1px solid #30363d',
                        color: page <= 1 ? '#4b5563' : '#c9d1d9',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        cursor: page <= 1 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      ◀ Prev
                    </button>
                    <span style={{ fontSize: '0.75rem', color: '#8b949e' }}>Page {page}</span>
                    <button
                      onClick={() => loadTable(selectedTable, page + 1)}
                      disabled={!tableData || page * 50 >= tableData.total_rows || tableLoading}
                      style={{
                        background: '#21262d',
                        border: '1px solid #30363d',
                        color: !tableData || page * 50 >= tableData.total_rows ? '#4b5563' : '#c9d1d9',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        cursor: !tableData || page * 50 >= tableData.total_rows ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Next ▶
                    </button>
                  </div>
                </div>
              )}

              <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
                {tableLoading ? (
                  <div style={{ color: '#8b949e', textAlign: 'center', marginTop: '40px' }}>Loading table records...</div>
                ) : !tableData || tableData.rows.length === 0 ? (
                  <div style={{ color: '#6e7681', textAlign: 'center', marginTop: '40px', fontStyle: 'italic' }}>
                    No rows found in this table.
                  </div>
                ) : (
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '0.78rem',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    <thead>
                      <tr style={{ background: '#161b22' }}>
                        {tableData.columns.map((col) => (
                          <th
                            key={col.field}
                            style={{
                              padding: '8px 12px',
                              textAlign: 'left',
                              color: '#58a6ff',
                              borderBottom: '1px solid #30363d',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {col.field}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.rows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          style={{
                            borderBottom: '1px solid #161b22',
                            background: rIdx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)',
                          }}
                        >
                          {tableData.columns.map((col) => (
                            <td
                              key={col.field}
                              style={{
                                padding: '8px 12px',
                                color: row[col.field] === null ? '#6b7280' : '#c9d1d9',
                                whiteSpace: 'nowrap',
                                maxWidth: '300px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {row[col.field] === null ? 'NULL' : String(row[col.field])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'query' ? (
          /* SQL Query Editor Tab */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#090d13', padding: '20px', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: '#8b949e', fontWeight: 600 }}>SQL STATEMENT:</span>
                <span style={{ fontSize: '0.75rem', color: '#58a6ff' }}>Isolated to schema: `{databaseName}`</span>
              </div>
              <textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                rows={4}
                style={{
                  width: '100%',
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: '8px',
                  color: '#f0f6fc',
                  padding: '12px',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.85rem',
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleRunQuery}
                  disabled={queryRunning}
                  style={{
                    background: '#238636',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 20px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: queryRunning ? 'not-allowed' : 'pointer',
                  }}
                >
                  {queryRunning ? 'Executing...' : 'Run Query ▶'}
                </button>
              </div>
            </div>

            {/* Query Results */}
            <div
              style={{
                flex: 1,
                background: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: '8px',
                overflow: 'auto',
                padding: '14px',
              }}
            >
              {!queryResult ? (
                <div style={{ color: '#6e7681', textAlign: 'center', marginTop: '40px', fontStyle: 'italic' }}>
                  Execute a query to inspect live database records.
                </div>
              ) : !queryResult.success ? (
                <div style={{ color: '#f87171', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                  ❌ {queryResult.error}
                </div>
              ) : queryResult.rows && queryResult.rows.length > 0 ? (
                <div>
                  <div style={{ marginBottom: '12px', fontSize: '0.75rem', color: '#34d399' }}>
                    ✔ Returned {queryResult.row_count} rows in {queryResult.execution_time_sec}s
                  </div>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '0.78rem',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    <thead>
                      <tr style={{ background: '#161b22' }}>
                        {queryResult.columns?.map((c) => (
                          <th key={c} style={{ padding: '8px 12px', textAlign: 'left', color: '#58a6ff', borderBottom: '1px solid #30363d' }}>
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryResult.rows.map((row, rIdx) => (
                        <tr key={rIdx} style={{ borderBottom: '1px solid #161b22' }}>
                          {queryResult.columns?.map((c) => (
                            <td key={c} style={{ padding: '8px 12px', color: '#c9d1d9', whiteSpace: 'nowrap' }}>
                              {String(row[c] ?? 'NULL')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ color: '#34d399', fontSize: '0.85rem' }}>
                  ✔ {queryResult.message || 'Query completed successfully.'} ({queryResult.execution_time_sec}s)
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Sync & Backups Tab */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#090d13', padding: '24px', gap: '20px', overflowY: 'auto' }}>
            <div>
              <h3 style={{ margin: 0, color: '#f0f6fc', fontSize: '1.1rem' }}>Database Synchronization & Backups</h3>
              <p style={{ margin: '4px 0 0 0', color: '#8b949e', fontSize: '0.8rem' }}>
                Clone records from your computer into the live phone database, import custom .sql dumps, or download live snapshots.
              </p>
            </div>

            {/* Grid of 3 Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
              {/* Option 1: 1-Click Sync Local Data */}
              <div
                style={{
                  background: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '1.3rem' }}>🔄</span>
                    <h4 style={{ margin: 0, color: '#f0f6fc', fontSize: '0.95rem' }}>1-Click Sync from Local PC</h4>
                  </div>
                  <p style={{ color: '#8b949e', fontSize: '0.78rem', lineHeight: '1.5', margin: 0 }}>
                    Automatically detects and copies your computer's local database records (SQLite or project .sql files) directly into the live phone schema (<code style={{ color: '#58a6ff' }}>{databaseName}</code>).
                  </p>
                </div>

                {syncResult && (
                  <div
                    style={{
                      padding: '10px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      background: syncResult.status === 'SYNCED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      border: `1px solid ${syncResult.status === 'SYNCED' ? '#10b981' : '#ef4444'}`,
                      color: syncResult.status === 'SYNCED' ? '#34d399' : '#f87171',
                    }}
                  >
                    <div>{syncResult.message}</div>
                    {syncResult.synced_sources.length > 0 && (
                      <div style={{ marginTop: '4px', color: '#9ca3af' }}>
                        Sources: {syncResult.synced_sources.join(', ')}
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handleSyncLocal}
                  disabled={syncing}
                  style={{
                    background: '#238636',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: syncing ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  {syncing ? '⏳ Syncing Records...' : '⚡ Sync Local PC Data to Live'}
                </button>
              </div>

              {/* Option 2: Upload / Import .SQL File */}
              <div
                style={{
                  background: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '1.3rem' }}>📤</span>
                    <h4 style={{ margin: 0, color: '#f0f6fc', fontSize: '0.95rem' }}>Import .SQL File</h4>
                  </div>
                  <p style={{ color: '#8b949e', fontSize: '0.78rem', lineHeight: '1.5', margin: 0 }}>
                    Select or drag-and-drop any standard <code style={{ color: '#58a6ff' }}>.sql</code> export from your computer to populate tables in MariaDB.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    type="file"
                    accept=".sql"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    style={{
                      background: '#0d1117',
                      border: '1px solid #30363d',
                      color: '#c9d1d9',
                      padding: '8px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                    }}
                  />
                  {selectedFile && (
                    <div style={{ fontSize: '0.72rem', color: '#34d399' }}>
                      Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}
                </div>

                {importResult && (
                  <div
                    style={{
                      padding: '10px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      background: importResult.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      border: `1px solid ${importResult.success ? '#10b981' : '#ef4444'}`,
                      color: importResult.success ? '#34d399' : '#f87171',
                    }}
                  >
                    {importResult.success ? importResult.message : importResult.error}
                  </div>
                )}

                <button
                  onClick={handleImportFile}
                  disabled={!selectedFile || importing}
                  style={{
                    background: '#1f6feb',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: !selectedFile || importing ? 'not-allowed' : 'pointer',
                    opacity: !selectedFile ? 0.6 : 1,
                  }}
                >
                  {importing ? '⏳ Importing SQL...' : '📤 Upload & Import to Live DB'}
                </button>
              </div>

              {/* Option 3: Download Live Backup */}
              <div
                style={{
                  background: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '1.3rem' }}>📥</span>
                    <h4 style={{ margin: 0, color: '#f0f6fc', fontSize: '0.95rem' }}>Download Live Backup</h4>
                  </div>
                  <p style={{ color: '#8b949e', fontSize: '0.78rem', lineHeight: '1.5', margin: 0 }}>
                    Creates an instant <code style={{ color: '#58a6ff' }}>mariadb-dump</code> snapshot of the live database from your phone and downloads it directly to your PC.
                  </p>
                </div>

                <div style={{ background: '#0d1117', padding: '12px', borderRadius: '6px', border: '1px solid #21262d' }}>
                  <div style={{ fontSize: '0.75rem', color: '#8b949e' }}>Schema: <strong>{databaseName}</strong></div>
                  <div style={{ fontSize: '0.75rem', color: '#8b949e' }}>Total Tables: <strong>{tables.length}</strong></div>
                </div>

                <a
                  href={getExportSqlUrl(projectId)}
                  download
                  style={{
                    background: '#374151',
                    border: '1px solid #4b5563',
                    color: '#f3f4f6',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    textDecoration: 'none',
                    textAlign: 'center',
                    display: 'block',
                  }}
                >
                  📥 Download .SQL Backup
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
