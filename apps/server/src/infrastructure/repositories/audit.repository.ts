import { Pool } from 'pg';
import { AuditLog } from '../../types/control-plane.js';
import { getDatabasePool } from '../database.js';

export interface IAuditRepository {
  record(entry: Omit<AuditLog, 'id' | 'createdAt'>): Promise<AuditLog>;
  listByOrganization(organizationId: string, limit?: number): Promise<AuditLog[]>;
  listByProject(projectId: string, limit?: number): Promise<AuditLog[]>;
}

export class PostgresAuditRepository implements IAuditRepository {
  constructor(private pool: Pool = getDatabasePool()) {}

  public async record(entry: Omit<AuditLog, 'id' | 'createdAt'>): Promise<AuditLog> {
    const res = await this.pool.query<AuditLog>(
      `INSERT INTO audit_logs (organization_id, project_id, actor_user_id, action, resource_type, resource_id, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, organization_id as "organizationId", project_id as "projectId",
                 actor_user_id as "actorUserId", action, resource_type as "resourceType",
                 resource_id as "resourceId", metadata, ip_address as "ipAddress",
                 created_at as "createdAt";`,
      [
        entry.organizationId,
        entry.projectId,
        entry.actorUserId,
        entry.action,
        entry.resourceType,
        entry.resourceId,
        JSON.stringify(entry.metadata ?? {}),
        entry.ipAddress,
      ],
    );
    const row = res.rows[0];
    if (!row) throw new Error('Failed to record audit log');
    return row;
  }

  public async listByOrganization(organizationId: string, limit = 50): Promise<AuditLog[]> {
    const res = await this.pool.query<AuditLog>(
      `SELECT id, organization_id as "organizationId", project_id as "projectId",
              actor_user_id as "actorUserId", action, resource_type as "resourceType",
              resource_id as "resourceId", metadata, ip_address as "ipAddress",
              created_at as "createdAt"
       FROM audit_logs
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT $2;`,
      [organizationId, limit],
    );
    return res.rows;
  }

  public async listByProject(projectId: string, limit = 50): Promise<AuditLog[]> {
    const res = await this.pool.query<AuditLog>(
      `SELECT id, organization_id as "organizationId", project_id as "projectId",
              actor_user_id as "actorUserId", action, resource_type as "resourceType",
              resource_id as "resourceId", metadata, ip_address as "ipAddress",
              created_at as "createdAt"
       FROM audit_logs
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT $2;`,
      [projectId, limit],
    );
    return res.rows;
  }
}

export class InMemoryAuditRepository implements IAuditRepository {
  private logs: AuditLog[] = [];
  private nextId = 1;

  public async record(entry: Omit<AuditLog, 'id' | 'createdAt'>): Promise<AuditLog> {
    const log: AuditLog = {
      id: this.nextId++,
      ...entry,
      createdAt: new Date(),
    };
    this.logs.unshift(log); // Prepend so newest is first
    return log;
  }

  public async listByOrganization(organizationId: string, limit = 50): Promise<AuditLog[]> {
    return this.logs.filter((l) => l.organizationId === organizationId).slice(0, limit);
  }

  public async listByProject(projectId: string, limit = 50): Promise<AuditLog[]> {
    return this.logs.filter((l) => l.projectId === projectId).slice(0, limit);
  }
}
