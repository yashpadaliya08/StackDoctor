export interface DiagnosticCheck {
  id: string;
  name: string;
  category: 'RUNTIME' | 'ENVIRONMENT' | 'DATABASE' | 'ASSETS' | 'STORAGE' | 'SECURITY';
  status: 'PASSED' | 'WARNING' | 'FAILED';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  explanation: string;
  remediation: string;
  auto_fixable: boolean;
  metadata?: Record<string, any>;
}

export interface ProjectMetadata {
  stack?: string;
  framework: string;
  framework_version?: string;
  detected_entrypoint?: string;
  php_requirement?: string;
  resolved_php_version: string;
  db_connection: string;
  asset_bundler?: string;
  has_vite_manifest: boolean;
  has_storage_link: boolean;
  is_cpanel_mangled: boolean;
  detected_env?: Record<string, string>;
}

export interface FixAction {
  check_id: string;
  action_type: string;
  target_file: string;
  description: string;
  diff_or_content?: string;
}

export interface DiagnosticReport {
  project_path: string;
  timestamp: string;
  readiness_score: number;
  metadata: ProjectMetadata;
  checks: DiagnosticCheck[];
  passed_count: number;
  warning_count: number;
  failed_count: number;
  auto_fixable_count: number;
  summary: string;
  available_fixes: FixAction[];
}

export interface AnalysisResponse {
  project_id: string;
  report: DiagnosticReport;
}

export interface FixResponse {
  project_id: string;
  applied_fixes: FixAction[];
  updated_report: DiagnosticReport;
}

export interface DeployResponse {
  deployment_id: string;
  project_id: string;
  subdomain: string;
  status: string;
  live_url?: string;
}

export interface GitHubDeployResponse {
  deployment_id: string;
  project_id: string;
  subdomain: string;
  status: string;
  repo_url: string;
  target: string;
}

export interface MySQLConfig {
  db_name: string;
  db_user: string;
  db_password: string;
  run_seeder: boolean;
  seeder_class: string;
}

export interface DeploymentLogEvent {
  timestamp: string;
  stage: string;
  message: string;
  level: 'INFO' | 'WARNING' | 'ERROR';
}

const API_BASE = '/api';

export async function uploadAndAnalyze(file: File): Promise<AnalysisResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/analyze/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(err.detail || 'Upload failed');
  }

  return res.json();
}

export async function analyzeGitRepo(repoUrl: string, branch?: string): Promise<AnalysisResponse> {
  const res = await fetch(`${API_BASE}/analyze/git`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_url: repoUrl, branch }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Git analysis failed' }));
    throw new Error(err.detail || 'Git analysis failed');
  }

  return res.json();
}

export async function fetchSampleProject(type: 'broken' | 'clean' | 'python' | 'node'): Promise<AnalysisResponse> {
  const res = await fetch(`${API_BASE}/analyze/sample/${type}`);
  if (!res.ok) {
    throw new Error('Failed to load sample project');
  }
  return res.json();
}

export async function applyFixes(
  projectId: string,
  appUrl: string = 'https://app.studentapp.dev',
  dbHost: string = 'mysql-internal'
): Promise<FixResponse> {
  const res = await fetch(`${API_BASE}/fix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      app_url: appUrl,
      db_host: dbHost,
      generate_docker: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to apply fixes' }));
    throw new Error(err.detail || 'Failed to apply fixes');
  }

  return res.json();
}

export async function createDeployment(
  projectId: string,
  subdomain?: string,
  target: 'phone' | 'local' = 'phone',
  dbConfig?: MySQLConfig,
  envVars?: Record<string, string>
): Promise<DeployResponse> {
  const body: Record<string, any> = { project_id: projectId, subdomain, target };
  if (dbConfig && target === 'phone') {
    if (dbConfig.db_name) body.db_name = dbConfig.db_name;
    if (dbConfig.db_user) body.db_user = dbConfig.db_user;
    if (dbConfig.db_password !== undefined) body.db_password = dbConfig.db_password;
    body.run_seeder = dbConfig.run_seeder;
    if (dbConfig.run_seeder && dbConfig.seeder_class) body.seeder_class = dbConfig.seeder_class;
  }
  if (envVars && Object.keys(envVars).length > 0) {
    body.env_vars = envVars;
  }

  const res = await fetch(`${API_BASE}/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Deployment failed' }));
    throw new Error(err.detail || 'Deployment failed');
  }

  return res.json();
}

export async function githubQuickDeploy(
  repoUrl: string,
  branch?: string,
  dbConfig?: MySQLConfig,
  target: 'phone' | 'local' = 'phone',
  subdomain?: string,
  envVars?: Record<string, string>
): Promise<GitHubDeployResponse> {
  const body: Record<string, any> = { repo_url: repoUrl, branch, target, subdomain };
  if (dbConfig) {
    if (dbConfig.db_name) body.db_name = dbConfig.db_name;
    if (dbConfig.db_user) body.db_user = dbConfig.db_user;
    if (dbConfig.db_password !== undefined) body.db_password = dbConfig.db_password;
    body.run_seeder = dbConfig.run_seeder;
    if (dbConfig.run_seeder && dbConfig.seeder_class) body.seeder_class = dbConfig.seeder_class;
  }
  if (envVars && Object.keys(envVars).length > 0) {
    body.env_vars = envVars;
  }

  const res = await fetch(`${API_BASE}/github-deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'GitHub deploy failed' }));
    throw new Error(err.detail || 'GitHub deploy failed');
  }

  return res.json();
}

export interface DeploymentTarget {
  id: 'phone' | 'local';
  name: string;
  type: string;
  online: boolean;
  ip: string;
  badge: string;
  features: string[];
  recommended: boolean;
}

export async function fetchDeploymentTargets(): Promise<DeploymentTarget[]> {
  try {
    const res = await fetch(`${API_BASE}/deploy/targets`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.targets || [];
  } catch {
    return [];
  }
}

export function listenDeploymentStream(
  deploymentId: string,
  onEvent: (event: DeploymentLogEvent) => void,
  onComplete: (data: any) => void,
  onError: (err: any) => void
): () => void {
  const eventSource = new EventSource(`${API_BASE}/deploy/${deploymentId}/stream`);

  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.stage === 'TERMINATED') {
        onComplete(data);
        eventSource.close();
      } else {
        onEvent(data);
      }
    } catch (err) {
      console.error('SSE parse error:', err);
    }
  };

  eventSource.onerror = (err) => {
    onError(err);
    eventSource.close();
  };

  return () => {
    eventSource.close();
  };
}

export interface DeploymentRecord {
  deployment_id: string;
  project_id: string;
  project_name: string;
  framework: string;
  subdomain: string;
  port: number;
  target: string;
  live_url?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ActiveDeploymentInfo {
  active: boolean;
  deployment?: DeploymentRecord;
  deployments?: DeploymentRecord[];
  phone_online: boolean;
}

export interface PhoneStats {
  online: boolean;
  ip?: string;
  port?: number;
  ram?: {
    total_mb: number;
    used_mb: number;
    free_mb: number;
    percent: number;
  };
  disk?: {
    total: string;
    used: string;
    avail: string;
    percent: string;
  };
  cpu?: {
    load_1m: string;
  };
  active_processes?: number;
  error?: string;
}

export async function fetchActiveDeployment(): Promise<ActiveDeploymentInfo | null> {
  try {
    const res = await fetch(`${API_BASE}/deploy/active`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function stopActiveDeployment(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/deploy/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error('Failed to stop deployment');
  }
  return res.json();
}

export async function stopProjectDeployment(projectId: string): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/deploy/stop/${projectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error('Failed to stop deployment');
  }
  return res.json();
}

export async function restartActiveDeployment(): Promise<{ status: string; live_url?: string }> {
  const res = await fetch(`${API_BASE}/deploy/restart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error('Failed to restart deployment');
  }
  return res.json();
}

export async function restartProjectDeployment(projectId: string): Promise<{ status: string; live_url?: string }> {
  const res = await fetch(`${API_BASE}/deploy/restart/${projectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error('Failed to restart deployment');
  }
  return res.json();
}

export async function deleteProjectDeployment(projectId: string): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/deploy/${projectId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error('Failed to delete deployment');
  }
  return res.json();
}

export async function fetchPhoneStats(): Promise<PhoneStats | null> {
  try {
    const res = await fetch(`${API_BASE}/deploy/phone/stats`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export interface PhoneCapabilities {
  online: boolean;
  host: string;
  port: number;
  disk?: string;
  ready_stacks: string[];
  runtimes: {
    php: { installed: boolean; version: string };
    composer: { installed: boolean; version: string };
    python: { installed: boolean; version: string };
    pip: { installed: boolean; version: string };
    node: { installed: boolean; version: string };
    npm: { installed: boolean; version: string };
    mariadb: { installed: boolean; version: string };
    cloudflared: { installed: boolean; version: string };
  };
}

export async function fetchPhoneCapabilities(): Promise<PhoneCapabilities | null> {
  try {
    const res = await fetch(`${API_BASE}/phone/capabilities`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ==========================================
// MANAGEMENT SUITE INTERFACES & API METHODS
// ==========================================

export interface AppLogsResponse {
  project_id: string;
  project_name: string;
  server_log: string;
  laravel_log: string;
  target: string;
  retrieved_at: string;
}

export interface ExecResponse {
  command: string;
  exit_code: number;
  stdout: string;
  stderr: string;
  execution_time_sec: number;
}

export interface DbTableInfo {
  name: string;
  rows: number;
  size_kb: number;
}

export interface DbTablesResponse {
  database: string;
  tables: DbTableInfo[];
  total_tables: number;
}

export interface DbTableDataResponse {
  database: string;
  table: string;
  columns: { field: string; type: string; null: string }[];
  rows: Record<string, any>[];
  total_rows: number;
  page: number;
  limit: number;
}

export interface SqlQueryResponse {
  success: boolean;
  columns?: string[];
  rows?: Record<string, any>[];
  row_count?: number;
  message?: string;
  error?: string;
  execution_time_sec: number;
}

export interface EnvItem {
  key: string;
  value: string;
  is_secret: boolean;
}

export interface EnvResponse {
  project_id: string;
  env_items: EnvItem[];
  total_variables: number;
}

export interface WatchdogStatus {
  enabled: boolean;
  running: boolean;
  check_interval_sec: number;
  last_check_at: string | null;
  total_checks: number;
  total_heals: number;
  recent_events: { timestamp: string; category: string; message: string; project_id?: string }[];
}

export async function fetchAppLogs(identifier: string, lines: number = 150): Promise<AppLogsResponse> {
  const res = await fetch(`${API_BASE}/manage/${identifier}/logs?lines=${lines}`);
  if (!res.ok) throw new Error('Failed to fetch application logs');
  return res.json();
}

export async function clearAppLogs(identifier: string): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/manage/${identifier}/logs/clear`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to clear logs');
  return res.json();
}

export async function execCommand(identifier: string, command: string): Promise<ExecResponse> {
  const res = await fetch(`${API_BASE}/manage/${identifier}/exec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStringifySafe({ command }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || 'Execution failed');
  }
  return res.json();
}

export async function fetchDbTables(identifier: string): Promise<DbTablesResponse> {
  const res = await fetch(`${API_BASE}/manage/${identifier}/db/tables`);
  if (!res.ok) throw new Error('Failed to fetch database tables');
  return res.json();
}

export async function fetchDbTableData(
  identifier: string,
  table: string,
  page: number = 1,
  limit: number = 50
): Promise<DbTableDataResponse> {
  const res = await fetch(`${API_BASE}/manage/${identifier}/db/table/${table}?page=${page}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch table data');
  return res.json();
}

export async function executeSqlQuery(identifier: string, query: string): Promise<SqlQueryResponse> {
  const res = await fetch(`${API_BASE}/manage/${identifier}/db/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStringifySafe({ query }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || 'Query execution failed');
  }
  return res.json();
}

export async function fetchEnvVariables(identifier: string): Promise<EnvResponse> {
  const res = await fetch(`${API_BASE}/manage/${identifier}/env`);
  if (!res.ok) throw new Error('Failed to fetch environment variables');
  return res.json();
}

export async function updateEnvVariables(
  identifier: string,
  env: Record<string, string>
): Promise<{ status: string; message: string; live_url?: string }> {
  const res = await fetch(`${API_BASE}/manage/${identifier}/env`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStringifySafe({ env }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || 'Failed to update environment variables');
  }
  return res.json();
}

export async function fetchWatchdogStatus(): Promise<WatchdogStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/manage/watchdog/status`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function toggleWatchdog(): Promise<{ enabled: boolean; status: string }> {
  const res = await fetch(`${API_BASE}/manage/watchdog/toggle`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to toggle watchdog');
  return res.json();
}

export interface SyncLocalDbResponse {
  status: string;
  message: string;
  synced_sources: string[];
  total_records: number;
}

export async function syncLocalDatabase(identifier: string): Promise<SyncLocalDbResponse> {
  const res = await fetch(`${API_BASE}/manage/${identifier}/db/sync-local`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to sync local database');
  }
  return res.json();
}

export async function importSqlDump(identifier: string, file: File): Promise<{ success: boolean; message?: string; error?: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/manage/${identifier}/db/import-sql`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to import SQL dump');
  }
  return res.json();
}

export function getExportSqlUrl(identifier: string): string {
  return `${API_BASE}/manage/${identifier}/db/export-sql`;
}

function jsonStringifySafe(obj: any): string {
  return JSON.stringify(obj);
}

// ==========================================
// 🚀 CI/CD & ROLLBACKS API
// ==========================================
export interface CicdRelease {
  version_id: string;
  commit_hash: string;
  commit_msg: string;
  author: string;
  branch: string;
  timestamp: string;
  status: 'ACTIVE' | 'SUPERSEDED' | 'ROLLED_BACK';
  trigger: string;
}

export interface WebhookConfig {
  project_id: string;
  webhook_url: string;
  secret_token: string;
  tracked_branch: string;
  repo_url?: string;
  auto_migrate: boolean;
  status: string;
}

export async function fetchCicdConfig(projectId: string): Promise<WebhookConfig> {
  const res = await fetch(`${API_BASE}/cicd/${projectId}/config`);
  if (!res.ok) throw new Error('Failed to fetch CI/CD configuration');
  return res.json();
}

export async function fetchReleaseHistory(projectId: string): Promise<{ history: CicdRelease[]; total_releases: number }> {
  const res = await fetch(`${API_BASE}/cicd/${projectId}/history`);
  if (!res.ok) throw new Error('Failed to fetch release history');
  return res.json();
}

export async function triggerRollback(projectId: string, versionId: string): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/cicd/${projectId}/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version_id: versionId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Rollback failed');
  }
  return res.json();
}

export async function triggerGitSync(
  projectId: string,
  repoUrl?: string,
  branch?: string
): Promise<{ status: string; message: string; release: CicdRelease }> {
  const res = await fetch(`${API_BASE}/cicd/${projectId}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_url: repoUrl, branch: branch }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Git sync failed');
  }
  return res.json();
}

// ==========================================
// 🌐 CUSTOM DOMAINS & SSL API
// ==========================================
export interface CustomDomain {
  domain: string;
  status: 'ACTIVE' | 'PENDING_DNS' | 'FAILED_VERIFICATION';
  ssl_status: 'ISSUED' | 'PROVISIONING';
  target_cname: string;
  resolved_ip?: string;
  created_at: string;
  last_checked: string;
}

export async function fetchCustomDomains(projectId: string): Promise<{ domains: CustomDomain[]; total: number }> {
  const res = await fetch(`${API_BASE}/domains/${projectId}`);
  if (!res.ok) throw new Error('Failed to fetch custom domains');
  return res.json();
}

export async function addCustomDomain(projectId: string, domain: string, tunnelUrl?: string): Promise<{ domain: CustomDomain; message: string }> {
  const res = await fetch(`${API_BASE}/domains/${projectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain, tunnel_url: tunnelUrl || '' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to add custom domain');
  }
  return res.json();
}

export async function verifyCustomDomain(projectId: string, domain: string): Promise<{ domain: CustomDomain; status: string }> {
  const res = await fetch(`${API_BASE}/domains/${projectId}/${domain}/verify`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Domain verification failed');
  }
  return res.json();
}

export async function removeCustomDomain(projectId: string, domain: string): Promise<{ status: string }> {
  try {
    const res = await fetch(`${API_BASE}/domains/${projectId}/${encodeURIComponent(domain)}`, { method: 'DELETE' });
    if (res.ok) return res.json();
  } catch {
    // continue to fallback
  }

  const resFallback = await fetch(`${API_BASE}/domains/${projectId}/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain }),
  });
  if (!resFallback.ok) {
    const err = await resFallback.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to remove custom domain');
  }
  return resFallback.json();
}

// ==========================================
// 🛡️ SECURITY AUDIT & RATE LIMITER API
// ==========================================
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  project_id: string;
  actor: string;
  details: string;
  status: 'SUCCESS' | 'FAILED' | 'WARNING';
  client_ip: string;
}

export async function fetchAuditLogs(limit: number = 50, action?: string, query?: string): Promise<{ logs: AuditLogEntry[]; total: number }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (action && action !== 'ALL') params.append('action', action);
  if (query) params.append('q', query);

  const res = await fetch(`${API_BASE}/security/audit-logs?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch audit logs');
  return res.json();
}

export async function fetchRateLimitStats(): Promise<{
  max_requests_per_min: number;
  window_seconds: number;
  active_client_ips: number;
  blocked_requests_total: number;
  status: string;
}> {
  const res = await fetch(`${API_BASE}/security/rate-limit-stats`);
  if (!res.ok) throw new Error('Failed to fetch rate limit stats');
  return res.json();
}

// ==========================================
// 📊 REAL-TIME APM ANALYTICS & ALERTS API
// ==========================================
export interface RouteProfile {
  path: string;
  count: number;
  avg_latency_ms: number;
  min_latency_ms: number;
  max_latency_ms: number;
  error_rate_pct: number;
  optimization_hint: string;
}

export interface CapacityEstimate {
  max_safe_rps: number;
  max_concurrent_users: number;
  php_workers: number;
  summary: string;
}

export interface APMTelemetry {
  project_id: string;
  total_requests: number;
  instant_rps: number;
  throughput_rpm: number;
  uptime_pct: number;
  error_rate_pct: number;
  avg_latency_ms: number;
  p50_latency_ms: number;
  p90_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  min_latency_ms: number;
  max_latency_ms: number;
  status_distribution: { '2xx': number; '3xx': number; '4xx': number; '5xx': number };
  timeline: Array<{ time: string; requests: number; avg_latency: number }>;
  top_endpoints: Array<{ path: string; count: number }>;
  route_profiles: RouteProfile[];
  capacity_estimate: CapacityEstimate;
}

export interface BenchmarkResult {
  session_id: string;
  target_url: string;
  concurrency: number;
  duration_sec: number;
  total_requests: number;
  avg_rps: number;
  peak_rps: number;
  avg_latency_ms: number;
  p50_latency_ms: number;
  p90_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  status_distribution: Record<string, number>;
  error_rate_pct: number;
  rating: string;
  assessment: string;
  completed_at: string;
}

export interface BenchmarkState {
  status: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ALREADY_RUNNING';
  session_id?: string;
  target_url?: string;
  concurrency?: number;
  duration_sec?: number;
  progress_pct: number;
  elapsed_sec: number;
  requests_completed: number;
  current_rps: number;
  p50_ms?: number;
  p95_ms?: number;
  errors_count: number;
  latest_result?: BenchmarkResult | null;
  error?: string;
}

export interface AlertConfig {
  webhook_url: string;
  channel_type: string;
  notify_on_down: boolean;
  notify_on_autoheal: boolean;
  notify_on_spike: boolean;
  enabled: boolean;
}

export async function fetchProjectAnalytics(projectId: string): Promise<APMTelemetry> {
  const res = await fetch(`${API_BASE}/analytics/${projectId}`);
  if (!res.ok) throw new Error('Failed to fetch analytics');
  return res.json();
}

export async function probeDeployment(
  projectId: string,
  targetUrl: string,
  path: string = '/'
): Promise<{ status_code: number; latency_ms: number; timestamp: number }> {
  const res = await fetch(`${API_BASE}/analytics/${projectId}/probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_url: targetUrl, path }),
  });
  if (!res.ok) throw new Error('Failed to probe deployment');
  return res.json();
}

export async function startBenchmark(
  projectId: string,
  targetUrl: string,
  concurrency: number = 25,
  durationSec: number = 10,
  path: string = '/'
): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/analytics/${projectId}/benchmark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_url: targetUrl, concurrency, duration_sec: durationSec, path }),
  });
  if (!res.ok) throw new Error('Failed to launch benchmark');
  return res.json();
}

export async function fetchBenchmarkStatus(projectId: string): Promise<BenchmarkState> {
  const res = await fetch(`${API_BASE}/analytics/${projectId}/benchmark/status`);
  if (!res.ok) throw new Error('Failed to fetch benchmark status');
  return res.json();
}

export async function fetchAlertConfig(): Promise<AlertConfig> {
  const res = await fetch(`${API_BASE}/analytics/alerts/config`);
  if (!res.ok) throw new Error('Failed to fetch alert configuration');
  return res.json();
}

export async function saveAlertConfig(config: AlertConfig): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/analytics/alerts/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Failed to save alert configuration');
  return res.json();
}

export async function testAlertNotification(): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/analytics/alerts/test`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to trigger test notification');
  return res.json();
}

export async function resetProjectAnalytics(projectId: string): Promise<{ status: string; message: string; summary: APMTelemetry }> {
  const res = await fetch(`${API_BASE}/analytics/${projectId}/reset`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to reset project telemetry');
  return res.json();
}

export interface GatewayRoute {
  slug: string;
  project_id: string;
  project_name: string;
  framework: string;
  port: number;
  target: string;
  target_url: string;
  status: string;
  updated_at: string;
  permanent_local_url?: string;
}

export interface GatewayRoutesResponse {
  routes: GatewayRoute[];
  total: number;
}

export async function fetchGatewayRoutes(): Promise<GatewayRoutesResponse> {
  const res = await fetch(`${API_BASE}/gateway/routes`);
  if (!res.ok) throw new Error('Failed to fetch gateway routes');
  return res.json();
}

export async function updateProjectSlug(projectId: string, slug: string, force: boolean = true): Promise<{ status: string; route: GatewayRoute }> {
  const res = await fetch(`${API_BASE}/gateway/slug`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, slug, force }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to update slug' }));
    throw new Error(err.detail || 'Failed to update slug');
  }
  return res.json();
}

export async function fetchCloudflareWorkerScript(): Promise<string> {
  const res = await fetch(`${API_BASE}/gateway/worker/script`);
  if (!res.ok) throw new Error('Failed to fetch Cloudflare Worker script');
  return res.text();
}

