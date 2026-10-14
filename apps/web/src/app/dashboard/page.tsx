'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import {
  api,
  Organization,
  Project,
  ApiKey,
  AuditLog,
  UsageSummaryResponse,
  OrganizationMember,
} from '@/lib/api';
import {
  Key,
  Layers,
  Activity,
  Plus,
  Copy,
  Check,
  AlertCircle,
  RefreshCw,
  Trash2,
  Users,
  Settings,
  Shield,
  Clock,
  Radio,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';

type Tab = 'overview' | 'projects' | 'keys' | 'usage' | 'settings';

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Tab Data States
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [usageData, setUsageData] = useState<UsageSummaryResponse | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);

  // UI / Feedback States
  const [loadingData, setLoadingData] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modals & One-Time Secret Display
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectEnv, setNewProjectEnv] = useState<'development' | 'production'>('development');

  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyEnv, setNewKeyEnv] = useState<'development' | 'production'>('development');
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member');

  const [confirmDeleteSlug, setConfirmDeleteSlug] = useState('');
  const [orgRenameName, setOrgRenameName] = useState('');

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Load organizations
  const loadOrgs = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingData(true);
      const res = await api.listOrganizations();
      setOrganizations(res.organizations);
      if (res.organizations.length > 0 && !selectedOrg) {
        const first = res.organizations[0];
        setSelectedOrg(first ?? null);
        setOrgRenameName(first?.name ?? '');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load organizations');
    } finally {
      setLoadingData(false);
    }
  }, [user, selectedOrg]);

  // Load projects for selected organization
  const loadProjects = useCallback(async (orgId: string) => {
    try {
      setLoadingData(true);
      const res = await api.listProjects(orgId);
      setProjects(res.projects);
      if (res.projects.length > 0) {
        setSelectedProject((prev) => {
          const match = prev ? res.projects.find((p) => p.id === prev.id) : null;
          return match ?? res.projects[0] ?? null;
        });
      } else {
        setSelectedProject(null);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoadingData(false);
    }
  }, []);

  // Load active project data (keys, audit logs, usage)
  const loadProjectData = useCallback(async (projectId: string) => {
    try {
      const [keysRes, logsRes, usageRes] = await Promise.all([
        api.listApiKeys(projectId).catch(() => ({ apiKeys: [] })),
        api.getProjectAuditLogs(projectId).catch(() => ({ auditLogs: [] })),
        api.getProjectUsage(projectId).catch(() => null),
      ]);
      setApiKeys(keysRes.apiKeys);
      setAuditLogs(logsRes.auditLogs);
      setUsageData(usageRes);
    } catch (err) {
      console.error('Error loading project data:', err);
    }
  }, []);

  // Load organization members
  const loadMembers = useCallback(async (orgId: string) => {
    try {
      const res = await api.listMembers(orgId);
      setMembers(res.members);
    } catch (err) {
      console.error('Error loading members:', err);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadOrgs();
    }
  }, [user, loadOrgs]);

  useEffect(() => {
    if (selectedOrg) {
      loadProjects(selectedOrg.id);
      loadMembers(selectedOrg.id);
      setOrgRenameName(selectedOrg.name);
    }
  }, [selectedOrg, loadProjects, loadMembers]);

  useEffect(() => {
    if (selectedProject) {
      loadProjectData(selectedProject.id);
    }
  }, [selectedProject, loadProjectData]);

  // Actions
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg || !newProjectName.trim()) return;
    setActionError(null);
    try {
      const res = await api.createProject({
        organizationId: selectedOrg.id,
        name: newProjectName.trim(),
        environment: newProjectEnv,
      });
      setShowCreateProjectModal(false);
      setNewProjectName('');
      setActionSuccess(
        `Project '${res.project.name}' successfully created! Initial API key provisioned.`,
      );
      await loadProjects(selectedOrg.id);
      setSelectedProject(res.project);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Project creation failed');
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !newKeyName.trim()) return;
    setActionError(null);
    try {
      const res = await api.createApiKey(selectedProject.id, {
        name: newKeyName.trim(),
        environment: newKeyEnv,
      });
      setShowCreateKeyModal(false);
      setNewKeyName('');
      setOneTimeSecret(res.secretKey);
      setActionSuccess('API Key generated successfully! Make sure to copy the secret key below.');
      loadProjectData(selectedProject.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'API key generation failed');
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!selectedProject) return;
    if (
      !confirm(
        'Are you sure you want to revoke this API credential? Any active clients using it will be disconnected.',
      )
    ) {
      return;
    }
    setActionError(null);
    try {
      await api.revokeApiKey(selectedProject.id, keyId);
      setActionSuccess('API key revoked successfully.');
      loadProjectData(selectedProject.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Revocation failed');
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg || !inviteEmail.trim()) return;
    setActionError(null);
    try {
      await api.addMember(selectedOrg.id, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setShowInviteModal(false);
      setInviteEmail('');
      setActionSuccess(`Member ${inviteEmail} successfully added to organization.`);
      loadMembers(selectedOrg.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add member');
    }
  };

  const handleUpdateOrgName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg || !orgRenameName.trim()) return;
    setActionError(null);
    try {
      const res = await api.updateOrganization(selectedOrg.id, orgRenameName.trim());
      setSelectedOrg(res.organization);
      setActionSuccess('Organization details updated.');
      loadOrgs();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update organization');
    }
  };

  const handleDeleteProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !selectedOrg) return;
    setActionError(null);
    try {
      await api.deleteProject(selectedProject.id, confirmDeleteSlug);
      setConfirmDeleteSlug('');
      setActionSuccess(`Project '${selectedProject.name}' permanently deleted.`);
      await loadProjects(selectedOrg.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Project deletion failed');
    }
  };

  // If user is not authenticated
  if (!authLoading && !user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600/20 border border-primary-500/30 text-primary-400 mb-6">
          <Shield className="h-8 w-8" />
        </div>
        <h1 className="text-3xl font-extrabold text-white">Developer Console Protected</h1>
        <p className="mt-3 text-slate-400 max-w-md mx-auto text-sm">
          Please sign in to your developer account or register to manage projects, generate API
          credentials, and monitor real-time collaboration.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/login"
            className="rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-500 transition-colors shadow-lg shadow-primary-600/30"
          >
            Sign In to Console
          </Link>
          <Link
            href="/register"
            className="rounded-lg border border-border bg-surface px-6 py-2.5 text-sm font-semibold text-slate-200 hover:border-slate-600 hover:text-white transition-colors"
          >
            Create Free Account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Console Header & Tenant Pickers */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Developer Console
            </h1>
            <span className="inline-flex items-center rounded-full bg-emerald-950/60 px-2.5 py-0.5 text-xs font-mono text-emerald-400 border border-emerald-800/40">
              Control Plane Active
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Multi-tenant project management, API credentials, real-time usage accounting, and audit
            logs.
          </p>
        </div>

        {/* Workspace & Project Switchers */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Organization Switcher */}
          <div className="relative">
            <select
              value={selectedOrg?.id || ''}
              onChange={(e) => {
                const org = organizations.find((o) => o.id === e.target.value);
                if (org) setSelectedOrg(org);
              }}
              className="appearance-none rounded-lg border border-border bg-surface pl-3 pr-8 py-2 text-xs font-medium text-white hover:border-slate-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  Workspace: {org.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          </div>

          {/* Project Switcher */}
          <div className="relative">
            <select
              value={selectedProject?.id || ''}
              onChange={(e) => {
                const proj = projects.find((p) => p.id === e.target.value);
                if (proj) setSelectedProject(proj);
              }}
              className="appearance-none rounded-lg border border-border bg-surface pl-3 pr-8 py-2 text-xs font-medium text-white hover:border-slate-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {projects.length === 0 ? (
                <option value="">No projects</option>
              ) : (
                projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    Project: {proj.name} ({proj.environment})
                  </option>
                ))
              )}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          </div>

          <button
            onClick={() => {
              if (selectedProject) loadProjectData(selectedProject.id);
            }}
            className="flex items-center justify-center h-8 w-8 rounded-lg border border-border bg-surface text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
            title="Refresh dashboard state"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Action Banners & Feedback */}
      {actionError && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-rose-800/40 bg-rose-950/40 p-3 text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="text-rose-400 hover:text-rose-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-800/40 bg-emerald-950/40 p-3 text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-400 hover:text-emerald-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ONE-TIME SECRET DISPLAY BANNER */}
      {oneTimeSecret && (
        <div className="mt-6 rounded-xl border border-cyan-500/50 bg-[#0c1424] p-5 shadow-2xl">
          <div className="flex items-start gap-3">
            <Key className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-white">
                Newly Generated Secret API Key (Reveal Once)
              </h3>
              <p className="mt-1 text-xs text-slate-300">
                This secret credential is cryptographically hashed with SHA-256 on the server. It
                will <span className="font-semibold text-cyan-300">never be displayed again</span>.
                Store it in your server environment secrets now.
              </p>
              <div className="mt-3 flex flex-col sm:flex-row items-center gap-2">
                <code className="w-full font-mono text-xs text-cyan-300 bg-black/60 border border-cyan-800/60 rounded-lg px-3 py-2 truncate select-all">
                  {oneTimeSecret}
                </code>
                <button
                  onClick={() => copyToClipboard(oneTimeSecret, 'secret-reveal')}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500 transition-colors shrink-0"
                >
                  {copiedId === 'secret-reveal' ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  <span>{copiedId === 'secret-reveal' ? 'Copied!' : 'Copy Secret'}</span>
                </button>
                <button
                  onClick={() => setOneTimeSecret(null)}
                  className="w-full sm:w-auto px-3 py-2 rounded-lg border border-border text-xs text-slate-400 hover:text-white transition-colors shrink-0"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="mt-6 flex border-b border-border/80 gap-2 sm:gap-6 overflow-x-auto pb-px">
        {[
          { id: 'overview', label: 'Overview', icon: Activity },
          { id: 'projects', label: 'Projects', icon: Layers },
          { id: 'keys', label: 'API Credentials', icon: Key },
          { id: 'usage', label: 'Usage & Metering', icon: Radio },
          { id: 'settings', label: 'Settings', icon: Settings },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex items-center gap-2 border-b-2 py-3 px-2 text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-primary-500 text-primary-400'
                  : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="mt-8 space-y-8">
          {/* Project Details Banner */}
          {selectedProject ? (
            <div className="rounded-xl border border-border bg-surface p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl font-bold text-white">{selectedProject.name}</h2>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-mono uppercase font-bold border ${
                        selectedProject.environment === 'production'
                          ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40'
                          : 'bg-amber-950/60 text-amber-400 border-amber-800/40'
                      }`}
                    >
                      {selectedProject.environment}
                    </span>
                    <span className="rounded bg-slate-800/80 px-2 py-0.5 text-[10px] font-mono text-slate-300 border border-slate-700/60">
                      Plan: {selectedProject.plan.toUpperCase()}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span>Public Project ID:</span>
                    <code className="font-mono text-slate-200 bg-[#0c101a] px-2 py-0.5 rounded border border-border">
                      {selectedProject.id}
                    </code>
                    <button
                      onClick={() => copyToClipboard(selectedProject.id, 'proj-id')}
                      className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 font-mono text-[11px]"
                    >
                      {copiedId === 'proj-id' ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      <span>{copiedId === 'proj-id' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Link
                    href={`/rooms/${selectedProject.slug}-demo`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-500 transition-colors shadow-md shadow-primary-600/30"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Open Collaborative Canvas</span>
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-surface/50 p-8 text-center text-slate-400">
              No projects found in this workspace. Create one below to get started.
            </div>
          )}

          {/* Real Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Active Conns
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white">
                  {usageData?.plan?.activeConnections ?? 0}
                </span>
                <span className="text-xs text-slate-500">
                  / {usageData?.plan?.maxConnections ?? 50} max
                </span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400">Concurrency gauge</div>
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Total Connections
              </div>
              <div className="mt-2 text-3xl font-extrabold text-cyan-400">
                {usageData?.summary?.connections ?? 0}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">Handshakes observed</div>
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Room Subscriptions
              </div>
              <div className="mt-2 text-3xl font-extrabold text-primary-400">
                {usageData?.summary?.room_joins ?? 0}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">Authorized room joins</div>
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                CRDT Update Volume
              </div>
              <div className="mt-2 text-3xl font-extrabold text-white">
                {usageData?.summary?.doc_update_bytes
                  ? `${(usageData.summary.doc_update_bytes / 1024).toFixed(1)} KB`
                  : '0 KB'}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">Accepted delta bytes</div>
            </div>
          </div>

          {/* Recent Audit Activity */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-cyan-400" />
                <h3 className="text-base font-semibold text-white">Recent Project Activity</h3>
              </div>
              <span className="text-xs text-slate-500 font-mono">Immutable audit trail</span>
            </div>

            {auditLogs.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-4">
                No administrative events recorded yet for this project.
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {auditLogs.slice(0, 5).map((log) => (
                  <div
                    key={log.id}
                    className="py-3 flex items-center justify-between gap-4 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-cyan-400 font-semibold bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 rounded">
                        {log.action}
                      </span>
                      <span className="text-slate-300">
                        {log.resourceType}: {log.resourceId || 'project'}
                      </span>
                    </div>
                    <span className="text-slate-500 font-mono shrink-0">
                      {new Date(log.createdAt).toLocaleTimeString()} ·{' '}
                      {new Date(log.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PROJECTS */}
      {activeTab === 'projects' && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Projects in {selectedOrg?.name}</h2>
              <p className="text-xs text-slate-400">
                Each project owns an isolated namespace of rooms, API credentials, and CRDT
                persistence records.
              </p>
            </div>
            <button
              onClick={() => setShowCreateProjectModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-500 transition-colors shadow-md shadow-primary-600/30"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Project</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((proj) => {
              const isCurrent = selectedProject?.id === proj.id;
              return (
                <div
                  key={proj.id}
                  className={`rounded-xl border p-5 transition-all ${
                    isCurrent
                      ? 'border-primary-500/80 bg-[#0e1424] shadow-lg shadow-primary-950/40'
                      : 'border-border bg-surface hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-white text-base">{proj.name}</h3>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">slug: {proj.slug}</p>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-mono uppercase font-bold border ${
                        proj.environment === 'production'
                          ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40'
                          : 'bg-amber-950/60 text-amber-400 border-amber-800/40'
                      }`}
                    >
                      {proj.environment}
                    </span>
                  </div>

                  <div className="mt-4 pt-4 border-t border-border/60 flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-mono text-[11px] truncate max-w-[150px]">
                      ID: {proj.id.slice(0, 8)}...
                    </span>
                    <button
                      onClick={() => setSelectedProject(proj)}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        isCurrent
                          ? 'bg-primary-950 text-primary-400 border border-primary-800/40 cursor-default'
                          : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      {isCurrent ? 'Active' : 'Select'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: API CREDENTIALS */}
      {activeTab === 'keys' && (
        <div className="mt-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">
                API Credentials for {selectedProject?.name}
              </h2>
              <p className="text-xs text-slate-400">
                Server-side secret keys to authenticate backend token issuance and authorize
                WebSocket connections.
              </p>
            </div>
            <button
              onClick={() => setShowCreateKeyModal(true)}
              disabled={!selectedProject}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-500 disabled:opacity-50 transition-colors shadow-md shadow-primary-600/30"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Generate API Key</span>
            </button>
          </div>

          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0c101a] text-slate-400 border-b border-border uppercase font-mono text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Key Prefix</th>
                    <th className="py-3 px-4">Environment</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Last Used</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {apiKeys.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 italic">
                        No API credentials generated yet for this project.
                      </td>
                    </tr>
                  ) : (
                    apiKeys.map((key) => {
                      const isRevoked = key.revokedAt !== null;
                      return (
                        <tr key={key.id} className="hover:bg-surfaceHover/50 transition-colors">
                          <td className="py-3.5 px-4 font-medium text-white">{key.name}</td>
                          <td className="py-3.5 px-4 font-mono text-cyan-400">{key.keyPrefix}</td>
                          <td className="py-3.5 px-4 font-mono uppercase text-[11px] text-slate-300">
                            {key.environment}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-mono font-semibold border ${
                                isRevoked
                                  ? 'bg-rose-950/60 text-rose-400 border-rose-800/40'
                                  : 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40'
                              }`}
                            >
                              {isRevoked ? 'Revoked' : 'Active'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-400">
                            {key.lastUsedAt
                              ? new Date(key.lastUsedAt).toLocaleDateString()
                              : 'Never'}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {!isRevoked && (
                              <button
                                onClick={() => handleRevokeKey(key.id)}
                                className="inline-flex items-center gap-1 text-rose-400 hover:text-rose-300 font-medium transition-colors"
                              >
                                <Trash2 className="h-3 w-3" />
                                <span>Revoke</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: USAGE & METERING */}
      {activeTab === 'usage' && (
        <div className="mt-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-white">Usage Metering & Plan Limits</h2>
            <p className="text-xs text-slate-400">
              Auditable, server-observed consumption metrics based on live WebSocket activity and
              document updates.
            </p>
          </div>

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-surface p-5">
              <span className="text-xs font-mono uppercase text-slate-400">Total Connections</span>
              <div className="mt-2 text-3xl font-extrabold text-white">
                {usageData?.summary?.connections ?? 0}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Authenticated client sockets</p>
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <span className="text-xs font-mono uppercase text-slate-400">Room Subscriptions</span>
              <div className="mt-2 text-3xl font-extrabold text-cyan-400">
                {usageData?.summary?.room_joins ?? 0}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Total room joins verified</p>
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <span className="text-xs font-mono uppercase text-slate-400">CRDT Update Bytes</span>
              <div className="mt-2 text-3xl font-extrabold text-primary-400">
                {usageData?.summary?.doc_update_bytes
                  ? `${(usageData.summary.doc_update_bytes / 1024).toFixed(1)} KB`
                  : '0 KB'}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Accepted payload volume</p>
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <span className="text-xs font-mono uppercase text-slate-400">Current Plan</span>
              <div className="mt-2 text-2xl font-extrabold text-emerald-400">
                {usageData?.plan?.displayName || 'Developer Free'}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Concurrency cap: {usageData?.plan?.maxConnections ?? 50}
              </p>
            </div>
          </div>

          {/* Daily Aggregate Table */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <h3 className="text-base font-semibold text-white mb-4">Daily Aggregated Breakdown</h3>
            {usageData?.daily && usageData.daily.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0c101a] text-slate-400 border-b border-border font-mono text-[11px]">
                    <tr>
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4">Metric</th>
                      <th className="py-2.5 px-4">Volume</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {usageData.daily.map((entry, idx) => (
                      <tr key={idx} className="hover:bg-surfaceHover/50 transition-colors">
                        <td className="py-2.5 px-4 font-mono text-slate-300">{entry.date}</td>
                        <td className="py-2.5 px-4 font-mono text-cyan-400">{entry.metric}</td>
                        <td className="py-2.5 px-4 font-bold text-white">{entry.totalQuantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic py-4">
                No daily usage recorded in this period.
              </p>
            )}
          </div>

          {/* Metric Definitions Card */}
          <div className="rounded-xl border border-border bg-surface p-6 text-xs text-slate-400 space-y-2">
            <h4 className="font-semibold text-slate-200 text-sm mb-2">
              Metric Definitions & Measurement Rules
            </h4>
            <p>
              • <span className="text-slate-200 font-mono">connections: </span>
              Counted only after a client completes cryptographically valid token authentication.
            </p>
            <p>
              • <span className="text-slate-200 font-mono">room_joins: </span>
              Recorded when room-level authorization succeeds. Rejected cross-project attempts are
              excluded.
            </p>
            <p>
              • <span className="text-slate-200 font-mono">doc_update_bytes: </span>
              Sum of raw byte sizes of accepted binary CRDT updates applied to room documents.
            </p>
          </div>
        </div>
      )}

      {/* TAB 5: SETTINGS */}
      {activeTab === 'settings' && (
        <div className="mt-8 space-y-8">
          {/* Workspace Settings */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <h3 className="text-base font-bold text-white mb-4">Workspace Details</h3>
            <form onSubmit={handleUpdateOrgName} className="space-y-4 max-w-md">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Workspace Name
                </label>
                <input
                  type="text"
                  value={orgRenameName}
                  onChange={(e) => setOrgRenameName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-[#0c101a] py-2 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-500 transition-colors"
              >
                Save Changes
              </button>
            </form>
          </div>

          {/* Team Members */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Team Members</h3>
              </div>
              <button
                onClick={() => setShowInviteModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-500 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Invite Member</span>
              </button>
            </div>

            <div className="divide-y divide-border/60">
              {members.map((member) => (
                <div key={member.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-medium text-white">
                      {member.user?.name || member.userId}
                    </div>
                    <div className="text-slate-400 font-mono text-[11px]">
                      {member.user?.email || ''}
                    </div>
                  </div>
                  <span className="rounded bg-slate-800 px-2.5 py-0.5 font-mono text-[11px] uppercase font-semibold text-slate-300 border border-slate-700">
                    {member.role}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Danger Zone: Delete Project */}
          {selectedProject && (
            <div className="rounded-xl border border-rose-900/60 bg-rose-950/20 p-6">
              <h3 className="text-base font-bold text-rose-400 mb-2">
                Danger Zone: Delete Project
              </h3>
              <p className="text-xs text-slate-400 mb-4 max-w-xl">
                Deleting a project will permanently revoke all associated API credentials and remove
                its room namespace. To confirm, type the project slug{' '}
                <code className="font-mono text-rose-300 font-semibold">
                  {selectedProject.slug}
                </code>{' '}
                below:
              </p>
              <form
                onSubmit={handleDeleteProject}
                className="flex flex-col sm:flex-row gap-3 max-w-md"
              >
                <input
                  type="text"
                  placeholder={selectedProject.slug}
                  value={confirmDeleteSlug}
                  onChange={(e) => setConfirmDeleteSlug(e.target.value)}
                  className="flex-1 rounded-lg border border-rose-900 bg-[#0c101a] py-2 px-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-rose-500 font-mono"
                />
                <button
                  type="submit"
                  disabled={confirmDeleteSlug !== selectedProject.slug}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-40 transition-colors"
                >
                  Delete Project
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* CREATE PROJECT MODAL */}
      {showCreateProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Create New Project</h3>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="Collaborative Whiteboard"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-[#0c101a] py-2 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Environment</label>
                <select
                  value={newProjectEnv}
                  onChange={(e) => setNewProjectEnv(e.target.value as 'development' | 'production')}
                  className="w-full rounded-lg border border-border bg-[#0c101a] py-2 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="development">Development (Test Keys & Relaxed Limits)</option>
                  <option value="production">Production (Live Keys & Strict Security)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowCreateProjectModal(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-500"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE API KEY MODAL */}
      {showCreateKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Generate API Credential</h3>
            <form onSubmit={handleCreateApiKey} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Key Description / Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="Backend Server Token Minting Key"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-[#0c101a] py-2 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Key Environment
                </label>
                <select
                  value={newKeyEnv}
                  onChange={(e) => setNewKeyEnv(e.target.value as 'development' | 'production')}
                  className="w-full rounded-lg border border-border bg-[#0c101a] py-2 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="development">Development (sf_test_sec_...)</option>
                  <option value="production">Production (sf_live_sec_...)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowCreateKeyModal(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-500"
                >
                  Generate Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INVITE MEMBER MODAL */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Invite Team Member</h3>
            <form onSubmit={handleInviteMember} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Member Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full rounded-lg border border-border bg-[#0c101a] py-2 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member' | 'viewer')}
                  className="w-full rounded-lg border border-border bg-[#0c101a] py-2 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="admin">Admin (Manage projects, keys, and members)</option>
                  <option value="member">Member (Create and edit projects)</option>
                  <option value="viewer">Viewer (Read-only access to metrics)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-500"
                >
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
