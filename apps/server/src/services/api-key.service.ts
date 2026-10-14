import {
  IApiKeyRepository,
  InMemoryApiKeyRepository,
  PostgresApiKeyRepository,
} from '../infrastructure/repositories/api-key.repository.js';
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
  IAuditRepository,
  InMemoryAuditRepository,
  PostgresAuditRepository,
} from '../infrastructure/repositories/audit.repository.js';
import { generateApiKey, hashToken } from '../utils/crypto.utils.js';
import { env } from '../config/env.js';
import { ApiKey, ApiKeyType, Project, ProjectEnvironment } from '../types/control-plane.js';

export class ApiKeyService {
  constructor(
    private apiKeyRepo: IApiKeyRepository = env.NODE_ENV === 'test'
      ? new InMemoryApiKeyRepository()
      : new PostgresApiKeyRepository(),
    private projectRepo: IProjectRepository = env.NODE_ENV === 'test'
      ? new InMemoryProjectRepository()
      : new PostgresProjectRepository(),
    private orgRepo: IOrganizationRepository = env.NODE_ENV === 'test'
      ? new InMemoryOrganizationRepository()
      : new PostgresOrganizationRepository(),
    private auditRepo: IAuditRepository = env.NODE_ENV === 'test'
      ? new InMemoryAuditRepository()
      : new PostgresAuditRepository(),
  ) {}

  public async createApiKey(data: {
    projectId: string;
    name: string;
    environment?: ProjectEnvironment;
    keyType?: ApiKeyType;
    scopes?: string[];
    userId: string;
    ipAddress?: string;
  }): Promise<{ apiKey: ApiKey; rawSecretKey: string }> {
    const project = await this.projectRepo.findById(data.projectId);
    if (!project) throw new Error('Project not found');

    const membership = await this.orgRepo.getMembership(project.organizationId, data.userId);
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new Error(
        'Unauthorized: Only organization owners and admins can generate API credentials',
      );
    }

    const envType = data.environment ?? project.environment;
    const { rawKey, keyPrefix, keyHash } = generateApiKey(envType);

    const apiKey = await this.apiKeyRepo.create({
      projectId: data.projectId,
      keyHash,
      keyPrefix,
      name: data.name.trim(),
      environment: envType,
      keyType: data.keyType ?? 'secret',
      scopes: data.scopes ?? ['rooms:read', 'rooms:write'],
    });

    await this.auditRepo.record({
      organizationId: project.organizationId,
      projectId: project.id,
      actorUserId: data.userId,
      action: 'api_key.create',
      resourceType: 'api_key',
      resourceId: apiKey.id,
      metadata: { keyPrefix, name: apiKey.name, environment: apiKey.environment },
      ipAddress: data.ipAddress ?? null,
    });

    return { apiKey, rawSecretKey: rawKey };
  }

  public async listApiKeys(projectId: string, userId: string): Promise<ApiKey[]> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) throw new Error('Project not found');

    const membership = await this.orgRepo.getMembership(project.organizationId, userId);
    if (!membership) {
      throw new Error('Unauthorized: You do not have access to this project');
    }

    return this.apiKeyRepo.listByProject(projectId);
  }

  public async revokeApiKey(data: {
    projectId: string;
    keyId: string;
    userId: string;
    ipAddress?: string;
  }): Promise<void> {
    const project = await this.projectRepo.findById(data.projectId);
    if (!project) throw new Error('Project not found');

    const membership = await this.orgRepo.getMembership(project.organizationId, data.userId);
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new Error(
        'Unauthorized: Only organization owners and admins can revoke API credentials',
      );
    }

    const key = await this.apiKeyRepo.findById(data.keyId);
    if (!key || key.projectId !== data.projectId) {
      throw new Error('API key not found');
    }

    await this.apiKeyRepo.revoke(data.keyId);

    await this.auditRepo.record({
      organizationId: project.organizationId,
      projectId: project.id,
      actorUserId: data.userId,
      action: 'api_key.revoke',
      resourceType: 'api_key',
      resourceId: key.id,
      metadata: { keyPrefix: key.keyPrefix },
      ipAddress: data.ipAddress ?? null,
    });
  }

  public async verifyApiKey(rawKey: string): Promise<{
    valid: boolean;
    apiKey?: ApiKey;
    project?: Project;
    reason?: string;
  }> {
    const cleanKey = rawKey.trim();
    const keyHash = hashToken(cleanKey);

    const apiKey = await this.apiKeyRepo.findByHash(keyHash);
    if (!apiKey) {
      return { valid: false, reason: 'Invalid API key' };
    }

    if (apiKey.revokedAt !== null) {
      return { valid: false, reason: 'API key has been revoked' };
    }

    const project = await this.projectRepo.findById(apiKey.projectId);
    if (!project) {
      return { valid: false, reason: 'Project no longer exists' };
    }

    // Update last used timestamp asynchronously
    this.apiKeyRepo.touchLastUsed(apiKey.id).catch(() => {});

    return { valid: true, apiKey, project };
  }
}
