export interface User {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  createdAt: string;
  user?: {
    email: string;
    name: string;
  };
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  environment: 'development' | 'production';
  plan: 'free' | 'pro' | 'enterprise';
  settings?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKey {
  id: string;
  projectId: string;
  keyPrefix: string;
  name: string;
  environment: 'development' | 'production';
  keyType: 'secret' | 'publishable';
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: number;
  organizationId: string | null;
  projectId: string | null;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export interface UsageSummaryResponse {
  summary: {
    connections: number;
    room_joins: number;
    doc_update_bytes: number;
    persisted_bytes: number;
  };
  daily: Array<{
    projectId: string;
    environment: string;
    metric: string;
    date: string;
    totalQuantity: number;
  }>;
  plan: {
    planName: string;
    displayName: string;
    maxConnections: number;
    maxMessageSizeBytes: number;
    monthlyAllowance: number;
    activeConnections: number;
  };
  metricsDefinitions: Record<string, string>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('syncforge_auth_token');
}

export function setStoredToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem('syncforge_auth_token', token);
  } else {
    localStorage.removeItem('syncforge_auth_token');
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token && !headers.authorization) {
    headers.authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorMsg =
      data?.error?.message || data?.message || `Request failed with status ${res.status}`;
    throw new Error(errorMsg);
  }

  return data.data !== undefined ? (data.data as T) : (data as T);
}

export const api = {
  // Auth
  async register(body: { email: string; password: string; name: string }) {
    const res = await request<{
      user: User;
      organization: Organization;
      project: Project;
      initialApiKey: string;
      token: string;
    }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setStoredToken(res.token);
    return res;
  },

  async login(body: { email: string; password: string }) {
    const res = await request<{
      user: User;
      token: string;
    }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setStoredToken(res.token);
    return res;
  },

  async logout() {
    try {
      await request('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      setStoredToken(null);
    }
  },

  async getMe() {
    return request<{ user: User }>('/api/v1/auth/me');
  },

  async requestPasswordReset(email: string) {
    return request<{ message: string; resetToken?: string }>(
      '/api/v1/auth/password-reset/request',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      },
    );
  },

  async confirmPasswordReset(body: { token: string; newPassword: string }) {
    return request<{ success: boolean; message: string }>('/api/v1/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // Organizations
  async listOrganizations() {
    return request<{ organizations: Organization[] }>('/api/v1/organizations');
  },

  async createOrganization(body: { name: string; slug?: string }) {
    return request<{ organization: Organization }>('/api/v1/organizations', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async getOrganization(orgId: string) {
    return request<{ organization: Organization }>(`/api/v1/organizations/${orgId}`);
  },

  async updateOrganization(orgId: string, name: string) {
    return request<{ organization: Organization }>(`/api/v1/organizations/${orgId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  },

  async listMembers(orgId: string) {
    return request<{ members: OrganizationMember[] }>(`/api/v1/organizations/${orgId}/members`);
  },

  async addMember(orgId: string, body: { email: string; role: string }) {
    return request<{ member: OrganizationMember }>(`/api/v1/organizations/${orgId}/members`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async removeMember(orgId: string, userId: string) {
    return request<{ success: boolean }>(`/api/v1/organizations/${orgId}/members/${userId}`, {
      method: 'DELETE',
    });
  },

  async getOrgAuditLogs(orgId: string) {
    return request<{ auditLogs: AuditLog[] }>(`/api/v1/organizations/${orgId}/audit-logs`);
  },

  // Projects
  async listProjects(organizationId: string) {
    return request<{ projects: Project[] }>(`/api/v1/projects?organizationId=${organizationId}`);
  },

  async createProject(body: {
    organizationId: string;
    name: string;
    slug?: string;
    environment?: string;
    plan?: string;
  }) {
    return request<{ project: Project; initialApiKey: string }>('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async getProject(projectId: string) {
    return request<{ project: Project }>(`/api/v1/projects/${projectId}`);
  },

  async updateProject(
    projectId: string,
    body: { name?: string; environment?: string; plan?: string },
  ) {
    return request<{ project: Project }>(`/api/v1/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  async deleteProject(projectId: string, confirmSlug: string) {
    return request<{ success: boolean }>(`/api/v1/projects/${projectId}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirmSlug }),
    });
  },

  async getProjectAuditLogs(projectId: string) {
    return request<{ auditLogs: AuditLog[] }>(`/api/v1/projects/${projectId}/audit-logs`);
  },

  // API Keys
  async listApiKeys(projectId: string) {
    return request<{ apiKeys: ApiKey[] }>(`/api/v1/projects/${projectId}/keys`);
  },

  async createApiKey(
    projectId: string,
    body: { name: string; environment?: string; scopes?: string[] },
  ) {
    return request<{
      apiKey: ApiKey;
      secretKey: string;
      warning: string;
    }>(`/api/v1/projects/${projectId}/keys`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async revokeApiKey(projectId: string, keyId: string) {
    return request<{ success: boolean }>(`/api/v1/projects/${projectId}/keys/${keyId}/revoke`, {
      method: 'POST',
    });
  },

  // Usage
  async getProjectUsage(projectId: string, from?: string, to?: string, metric?: string) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (metric) params.set('metric', metric);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<UsageSummaryResponse>(`/api/v1/projects/${projectId}/usage${qs}`);
  },
};
