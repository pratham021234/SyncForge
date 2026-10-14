import crypto from 'crypto';
import { Pool } from 'pg';
import { ApiKey, ApiKeyType, ProjectEnvironment } from '../../types/control-plane.js';
import { getDatabasePool } from '../database.js';

export interface IApiKeyRepository {
  create(data: {
    projectId: string;
    keyHash: string;
    keyPrefix: string;
    name: string;
    environment?: ProjectEnvironment;
    keyType?: ApiKeyType;
    scopes?: string[];
  }): Promise<ApiKey>;
  findById(id: string): Promise<ApiKey | null>;
  findByHash(keyHash: string): Promise<ApiKey | null>;
  listByProject(projectId: string): Promise<ApiKey[]>;
  revoke(id: string): Promise<void>;
  touchLastUsed(id: string): Promise<void>;
}

export class PostgresApiKeyRepository implements IApiKeyRepository {
  constructor(private pool: Pool = getDatabasePool()) {}

  public async create(data: {
    projectId: string;
    keyHash: string;
    keyPrefix: string;
    name: string;
    environment?: ProjectEnvironment;
    keyType?: ApiKeyType;
    scopes?: string[];
  }): Promise<ApiKey> {
    const environment = data.environment ?? 'development';
    const keyType = data.keyType ?? 'secret';
    const scopes = data.scopes ?? ['rooms:read', 'rooms:write'];

    const res = await this.pool.query<ApiKey>(
      `INSERT INTO api_keys (project_id, key_hash, key_prefix, name, environment, key_type, scopes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, project_id as "projectId", key_hash as "keyHash", key_prefix as "keyPrefix",
                 name, environment, key_type as "keyType", scopes,
                 last_used_at as "lastUsedAt", revoked_at as "revokedAt", created_at as "createdAt";`,
      [
        data.projectId,
        data.keyHash,
        data.keyPrefix,
        data.name.trim(),
        environment,
        keyType,
        scopes,
      ],
    );

    const row = res.rows[0];
    if (!row) throw new Error('Failed to create api key record');
    return row;
  }

  public async findById(id: string): Promise<ApiKey | null> {
    const res = await this.pool.query<ApiKey>(
      `SELECT id, project_id as "projectId", key_hash as "keyHash", key_prefix as "keyPrefix",
              name, environment, key_type as "keyType", scopes,
              last_used_at as "lastUsedAt", revoked_at as "revokedAt", created_at as "createdAt"
       FROM api_keys WHERE id = $1 LIMIT 1;`,
      [id],
    );
    return res.rows[0] ?? null;
  }

  public async findByHash(keyHash: string): Promise<ApiKey | null> {
    const res = await this.pool.query<ApiKey>(
      `SELECT id, project_id as "projectId", key_hash as "keyHash", key_prefix as "keyPrefix",
              name, environment, key_type as "keyType", scopes,
              last_used_at as "lastUsedAt", revoked_at as "revokedAt", created_at as "createdAt"
       FROM api_keys WHERE key_hash = $1 LIMIT 1;`,
      [keyHash],
    );
    return res.rows[0] ?? null;
  }

  public async listByProject(projectId: string): Promise<ApiKey[]> {
    const res = await this.pool.query<ApiKey>(
      `SELECT id, project_id as "projectId", key_hash as "keyHash", key_prefix as "keyPrefix",
              name, environment, key_type as "keyType", scopes,
              last_used_at as "lastUsedAt", revoked_at as "revokedAt", created_at as "createdAt"
       FROM api_keys WHERE project_id = $1
       ORDER BY created_at DESC;`,
      [projectId],
    );
    return res.rows;
  }

  public async revoke(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1 AND revoked_at IS NULL;',
      [id],
    );
  }

  public async touchLastUsed(id: string): Promise<void> {
    await this.pool.query('UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1;', [
      id,
    ]);
  }
}

export class InMemoryApiKeyRepository implements IApiKeyRepository {
  private apiKeys = new Map<string, ApiKey>();

  public async create(data: {
    projectId: string;
    keyHash: string;
    keyPrefix: string;
    name: string;
    environment?: ProjectEnvironment;
    keyType?: ApiKeyType;
    scopes?: string[];
  }): Promise<ApiKey> {
    const id = crypto.randomUUID();
    const apiKey: ApiKey = {
      id,
      projectId: data.projectId,
      keyHash: data.keyHash,
      keyPrefix: data.keyPrefix,
      name: data.name.trim(),
      environment: data.environment ?? 'development',
      keyType: data.keyType ?? 'secret',
      scopes: data.scopes ?? ['rooms:read', 'rooms:write'],
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date(),
    };
    this.apiKeys.set(id, apiKey);
    return apiKey;
  }

  public async findById(id: string): Promise<ApiKey | null> {
    return this.apiKeys.get(id) ?? null;
  }

  public async findByHash(keyHash: string): Promise<ApiKey | null> {
    for (const key of this.apiKeys.values()) {
      if (key.keyHash === keyHash) return key;
    }
    return null;
  }

  public async listByProject(projectId: string): Promise<ApiKey[]> {
    return Array.from(this.apiKeys.values())
      .filter((k) => k.projectId === projectId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public async revoke(id: string): Promise<void> {
    const key = this.apiKeys.get(id);
    if (key && !key.revokedAt) {
      key.revokedAt = new Date();
    }
  }

  public async touchLastUsed(id: string): Promise<void> {
    const key = this.apiKeys.get(id);
    if (key) {
      key.lastUsedAt = new Date();
    }
  }
}
