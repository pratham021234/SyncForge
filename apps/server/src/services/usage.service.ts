import {
  IUsageRepository,
  InMemoryUsageRepository,
  PostgresUsageRepository,
} from '../infrastructure/repositories/usage.repository.js';
import {
  IProjectRepository,
  InMemoryProjectRepository,
  PostgresProjectRepository,
} from '../infrastructure/repositories/project.repository.js';
import {
  IOrganizationRepository,
  InMemoryOrganizationRepository,
  PostgresOrganizationRepository,
} from '../infrastructure/repositories/organization.repository.js';
import { env } from '../config/env.js';
import {
  PLAN_LIMITS,
  ProjectEnvironment,
  UsageDailyAggregate,
  UsageMetric,
} from '../types/control-plane.js';

export interface UsageSummaryResponse {
  summary: Record<UsageMetric, number>;
  daily: UsageDailyAggregate[];
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

export class UsageService {
  constructor(
    private usageRepo: IUsageRepository = env.NODE_ENV === 'test'
      ? new InMemoryUsageRepository()
      : new PostgresUsageRepository(),
    private projectRepo: IProjectRepository = env.NODE_ENV === 'test'
      ? new InMemoryProjectRepository()
      : new PostgresProjectRepository(),
    private orgRepo: IOrganizationRepository = env.NODE_ENV === 'test'
      ? new InMemoryOrganizationRepository()
      : new PostgresOrganizationRepository(),
  ) {}

  public async recordEvent(data: {
    projectId: string;
    environment?: ProjectEnvironment;
    metric: UsageMetric;
    quantity?: number;
    idempotencyKey?: string;
  }): Promise<void> {
    const environment = data.environment ?? 'development';
    const quantity = data.quantity ?? 1;

    await this.usageRepo.recordEvent({
      projectId: data.projectId,
      environment,
      metric: data.metric,
      quantity,
      recordedAt: new Date(),
      idempotencyKey: data.idempotencyKey,
    });
  }

  public async recordConnection(
    projectId: string,
    environment?: ProjectEnvironment,
  ): Promise<void> {
    await this.recordEvent({
      projectId,
      environment,
      metric: 'connections',
      quantity: 1,
    });
    this.usageRepo.incrementActiveConnections(projectId);
  }

  public recordConnectionClose(projectId: string): void {
    this.usageRepo.decrementActiveConnections(projectId);
  }

  public async recordRoomJoin(projectId: string, environment?: ProjectEnvironment): Promise<void> {
    await this.recordEvent({
      projectId,
      environment,
      metric: 'room_joins',
      quantity: 1,
    });
  }

  public async recordDocUpdateBytes(
    projectId: string,
    bytes: number,
    environment?: ProjectEnvironment,
  ): Promise<void> {
    if (bytes <= 0) return;
    await this.recordEvent({
      projectId,
      environment,
      metric: 'doc_update_bytes',
      quantity: bytes,
    });
  }

  public async checkPlanLimits(projectId: string): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    // Default development and test namespaces are automatically permitted
    if (projectId === 'project_test_default' || projectId === 'project_dev_default') {
      return { allowed: true };
    }

    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      return { allowed: false, reason: 'Project not found' };
    }

    const limits = PLAN_LIMITS[project.plan] ?? PLAN_LIMITS.free;
    const activeConns = this.usageRepo.getActiveConnections(projectId);

    if (activeConns >= limits.maxConnections) {
      return {
        allowed: false,
        reason: `Project has reached maximum concurrent connection limit (${limits.maxConnections}) on the ${limits.displayName} plan`,
      };
    }

    return { allowed: true };
  }

  public async getProjectUsage(data: {
    projectId: string;
    userId: string;
    from?: Date;
    to?: Date;
    metric?: UsageMetric;
  }): Promise<UsageSummaryResponse> {
    const project = await this.projectRepo.findById(data.projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const membership = await this.orgRepo.getMembership(project.organizationId, data.userId);
    if (!membership) {
      throw new Error('Unauthorized: You do not have access to this project');
    }

    const now = new Date();
    // Default range: last 30 days
    const from = data.from ?? new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const to = data.to ?? now;

    const summary = await this.usageRepo.getUsageSummary(data.projectId, from, to);
    const daily = await this.usageRepo.getAggregatedUsage(data.projectId, from, to, data.metric);

    const limits = PLAN_LIMITS[project.plan] ?? PLAN_LIMITS.free;
    const activeConnections = this.usageRepo.getActiveConnections(data.projectId);

    return {
      summary,
      daily,
      plan: {
        planName: project.plan,
        displayName: limits.displayName,
        maxConnections: limits.maxConnections,
        maxMessageSizeBytes: limits.maxMessageSizeBytes,
        monthlyAllowance: limits.monthlyUpdateAllowance,
        activeConnections,
      },
      metricsDefinitions: {
        connections: 'Total authenticated WebSocket client connections initiated.',
        room_joins: 'Total room subscriptions joined across all connected clients.',
        doc_update_bytes: 'Cumulative payload volume of accepted CRDT document updates.',
        persisted_bytes:
          'Cumulative bytes saved into durable PostgreSQL storage snapshots and logs.',
      },
    };
  }
}
