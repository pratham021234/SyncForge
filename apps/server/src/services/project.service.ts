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
import {
  IApiKeyRepository,
  InMemoryApiKeyRepository,
  PostgresApiKeyRepository,
} from '../infrastructure/repositories/api-key.repository.js';
import {
  IAuditRepository,
  InMemoryAuditRepository,
  PostgresAuditRepository,
} from '../infrastructure/repositories/audit.repository.js';
import { generateApiKey } from '../utils/crypto.utils.js';
import { env } from '../config/env.js';
import {
  Project,
  ProjectEnvironment,
  ProjectPlan,
  ProjectSettings,
  AuditLog,
} from '../types/control-plane.js';

export class ProjectService {
  constructor(
    private projectRepo: IProjectRepository = env.NODE_ENV === 'test'
      ? new InMemoryProjectRepository()
      : new PostgresProjectRepository(),
    private orgRepo: IOrganizationRepository = env.NODE_ENV === 'test'
      ? new InMemoryOrganizationRepository()
      : new PostgresOrganizationRepository(),
    private apiKeyRepo: IApiKeyRepository = env.NODE_ENV === 'test'
      ? new InMemoryApiKeyRepository()
      : new PostgresApiKeyRepository(),
    private auditRepo: IAuditRepository = env.NODE_ENV === 'test'
      ? new InMemoryAuditRepository()
      : new PostgresAuditRepository(),
  ) {}

  public async createProject(data: {
    organizationId: string;
    name: string;
    slug?: string;
    environment?: ProjectEnvironment;
    plan?: ProjectPlan;
    settings?: ProjectSettings;
    userId: string;
    ipAddress?: string;
  }): Promise<{ project: Project; initialApiKey: string }> {
    const membership = await this.orgRepo.getMembership(data.organizationId, data.userId);
    if (!membership || !['owner', 'admin', 'member'].includes(membership.role)) {
      throw new Error(
        'Unauthorized: You do not have permission to create projects in this organization',
      );
    }

    const slug =
      (data.slug || data.name)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 36) + `-${Math.random().toString(36).slice(2, 6)}`;

    const project = await this.projectRepo.create({
      organizationId: data.organizationId,
      name: data.name,
      slug,
      environment: data.environment ?? 'development',
      plan: data.plan ?? 'free',
      settings: data.settings,
    });

    // Auto-generate initial secret key
    const envType = project.environment;
    const { rawKey, keyPrefix, keyHash } = generateApiKey(envType);
    await this.apiKeyRepo.create({
      projectId: project.id,
      keyHash,
      keyPrefix,
      name: `${envType === 'production' ? 'Production' : 'Development'} Secret Key`,
      environment: envType,
      keyType: 'secret',
      scopes: ['rooms:read', 'rooms:write'],
    });

    await this.auditRepo.record({
      organizationId: data.organizationId,
      projectId: project.id,
      actorUserId: data.userId,
      action: 'project.create',
      resourceType: 'project',
      resourceId: project.id,
      metadata: { name: project.name, slug: project.slug, environment: project.environment },
      ipAddress: data.ipAddress ?? null,
    });

    return { project, initialApiKey: rawKey };
  }

  public async listProjects(organizationId: string, userId: string): Promise<Project[]> {
    const membership = await this.orgRepo.getMembership(organizationId, userId);
    if (!membership) {
      throw new Error('Unauthorized: You do not have access to this organization');
    }
    return this.projectRepo.listByOrganization(organizationId);
  }

  public async getProject(projectId: string, userId: string): Promise<Project> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const membership = await this.orgRepo.getMembership(project.organizationId, userId);
    if (!membership) {
      throw new Error('Unauthorized: You do not have access to this project');
    }

    return project;
  }

  public async updateProject(data: {
    projectId: string;
    name?: string;
    environment?: ProjectEnvironment;
    plan?: ProjectPlan;
    settings?: ProjectSettings;
    userId: string;
    ipAddress?: string;
  }): Promise<Project> {
    const project = await this.getProject(data.projectId, data.userId);
    const membership = await this.orgRepo.getMembership(project.organizationId, data.userId);

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new Error(
        'Unauthorized: Only organization owners and admins can update project settings',
      );
    }

    const updated = await this.projectRepo.update(data.projectId, {
      name: data.name,
      environment: data.environment,
      plan: data.plan,
      settings: data.settings,
    });

    await this.auditRepo.record({
      organizationId: project.organizationId,
      projectId: project.id,
      actorUserId: data.userId,
      action: 'project.update',
      resourceType: 'project',
      resourceId: project.id,
      metadata: { name: updated.name, environment: updated.environment, plan: updated.plan },
      ipAddress: data.ipAddress ?? null,
    });

    return updated;
  }

  public async deleteProject(data: {
    projectId: string;
    confirmSlug: string;
    userId: string;
    ipAddress?: string;
  }): Promise<void> {
    const project = await this.getProject(data.projectId, data.userId);
    const membership = await this.orgRepo.getMembership(project.organizationId, data.userId);

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new Error('Unauthorized: Only organization owners and admins can delete projects');
    }

    if (data.confirmSlug.trim().toLowerCase() !== project.slug.toLowerCase()) {
      throw new Error(`Confirmation mismatch: please enter '${project.slug}' to confirm deletion`);
    }

    await this.projectRepo.delete(data.projectId);

    await this.auditRepo.record({
      organizationId: project.organizationId,
      projectId: project.id,
      actorUserId: data.userId,
      action: 'project.delete',
      resourceType: 'project',
      resourceId: project.id,
      metadata: { slug: project.slug },
      ipAddress: data.ipAddress ?? null,
    });
  }

  public async listAuditLogs(projectId: string, userId: string, limit = 50): Promise<AuditLog[]> {
    const project = await this.getProject(projectId, userId);
    return this.auditRepo.listByProject(project.id, limit);
  }
}
