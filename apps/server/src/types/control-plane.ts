export type OrganizationRole = 'owner' | 'admin' | 'member' | 'viewer';
export type ProjectEnvironment = 'development' | 'production';
export type ProjectPlan = 'free' | 'pro' | 'enterprise';
export type ApiKeyType = 'secret' | 'publishable';
export type UsageMetric = 'connections' | 'room_joins' | 'doc_update_bytes' | 'persisted_bytes';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationMembership {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  createdAt: Date;
  updatedAt: Date;
  // Hydrated user fields when querying members
  user?: {
    email: string;
    name: string;
  };
}

export interface ProjectSettings {
  maxConnections?: number;
  maxMessageSizeBytes?: number;
  allowedOrigins?: string[];
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  environment: ProjectEnvironment;
  plan: ProjectPlan;
  settings: ProjectSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKey {
  id: string;
  projectId: string;
  keyHash: string;
  keyPrefix: string;
  name: string;
  environment: ProjectEnvironment;
  keyType: ApiKeyType;
  scopes: string[];
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface UsageEvent {
  id?: number;
  projectId: string;
  environment: ProjectEnvironment;
  metric: UsageMetric;
  quantity: number;
  recordedAt: Date;
  idempotencyKey?: string;
}

export interface UsageDailyAggregate {
  projectId: string;
  environment: ProjectEnvironment;
  metric: UsageMetric;
  date: string; // YYYY-MM-DD
  totalQuantity: number;
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
  createdAt: Date;
}

export interface PlanLimits {
  name: ProjectPlan;
  displayName: string;
  maxConnections: number;
  maxMessageSizeBytes: number;
  monthlyUpdateAllowance: number;
}

export const PLAN_LIMITS: Record<ProjectPlan, PlanLimits> = {
  free: {
    name: 'free',
    displayName: 'Developer Free',
    maxConnections: 50,
    maxMessageSizeBytes: 512 * 1024, // 512KB
    monthlyUpdateAllowance: 100_000,
  },
  pro: {
    name: 'pro',
    displayName: 'Team Pro',
    maxConnections: 500,
    maxMessageSizeBytes: 2 * 1024 * 1024, // 2MB
    monthlyUpdateAllowance: 5_000_000,
  },
  enterprise: {
    name: 'enterprise',
    displayName: 'Enterprise Dedicated',
    maxConnections: 10_000,
    maxMessageSizeBytes: 10 * 1024 * 1024, // 10MB
    monthlyUpdateAllowance: 100_000_000,
  },
};
