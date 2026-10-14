import crypto from 'crypto';
import { Pool } from 'pg';
import {
  Organization,
  OrganizationMembership,
  OrganizationRole,
} from '../../types/control-plane.js';
import { getDatabasePool } from '../database.js';

export interface IOrganizationRepository {
  create(data: { name: string; slug: string }, ownerUserId: string): Promise<Organization>;
  findById(id: string): Promise<Organization | null>;
  findBySlug(slug: string): Promise<Organization | null>;
  listUserOrganizations(userId: string): Promise<Array<Organization & { role: OrganizationRole }>>;
  getMembership(organizationId: string, userId: string): Promise<OrganizationMembership | null>;
  listMembers(organizationId: string): Promise<OrganizationMembership[]>;
  addMember(
    organizationId: string,
    userId: string,
    role: OrganizationRole,
  ): Promise<OrganizationMembership>;
  updateMemberRole(organizationId: string, userId: string, role: OrganizationRole): Promise<void>;
  removeMember(organizationId: string, userId: string): Promise<void>;
  update(id: string, data: { name: string }): Promise<Organization>;
}

export class PostgresOrganizationRepository implements IOrganizationRepository {
  constructor(private pool: Pool = getDatabasePool()) {}

  public async create(
    data: { name: string; slug: string },
    ownerUserId: string,
  ): Promise<Organization> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN;');

      const orgRes = await client.query<Organization>(
        `INSERT INTO organizations (name, slug)
         VALUES ($1, $2)
         RETURNING id, name, slug, created_at as "createdAt", updated_at as "updatedAt";`,
        [data.name.trim(), data.slug.trim().toLowerCase()],
      );

      const org = orgRes.rows[0];
      if (!org) throw new Error('Failed to insert organization');

      await client.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role)
         VALUES ($1, $2, 'owner');`,
        [org.id, ownerUserId],
      );

      await client.query('COMMIT;');
      return org;
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  public async findById(id: string): Promise<Organization | null> {
    const res = await this.pool.query<Organization>(
      'SELECT id, name, slug, created_at as "createdAt", updated_at as "updatedAt" FROM organizations WHERE id = $1 LIMIT 1;',
      [id],
    );
    return res.rows[0] ?? null;
  }

  public async findBySlug(slug: string): Promise<Organization | null> {
    const res = await this.pool.query<Organization>(
      'SELECT id, name, slug, created_at as "createdAt", updated_at as "updatedAt" FROM organizations WHERE LOWER(slug) = LOWER($1) LIMIT 1;',
      [slug.trim()],
    );
    return res.rows[0] ?? null;
  }

  public async listUserOrganizations(
    userId: string,
  ): Promise<Array<Organization & { role: OrganizationRole }>> {
    const res = await this.pool.query<Organization & { role: OrganizationRole }>(
      `SELECT o.id, o.name, o.slug, o.created_at as "createdAt", o.updated_at as "updatedAt", m.role
       FROM organizations o
       JOIN organization_memberships m ON o.id = m.organization_id
       WHERE m.user_id = $1
       ORDER BY o.created_at ASC;`,
      [userId],
    );
    return res.rows;
  }

  public async getMembership(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembership | null> {
    const res = await this.pool.query<OrganizationMembership>(
      `SELECT id, organization_id as "organizationId", user_id as "userId", role,
              created_at as "createdAt", updated_at as "updatedAt"
       FROM organization_memberships
       WHERE organization_id = $1 AND user_id = $2
       LIMIT 1;`,
      [organizationId, userId],
    );
    return res.rows[0] ?? null;
  }

  public async listMembers(organizationId: string): Promise<OrganizationMembership[]> {
    const res = await this.pool.query<OrganizationMembership & { email: string; name: string }>(
      `SELECT m.id, m.organization_id as "organizationId", m.user_id as "userId", m.role,
              m.created_at as "createdAt", m.updated_at as "updatedAt",
              u.email, u.name
       FROM organization_memberships m
       JOIN users u ON m.user_id = u.id
       WHERE m.organization_id = $1
       ORDER BY m.created_at ASC;`,
      [organizationId],
    );

    return res.rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      userId: row.userId,
      role: row.role,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      user: {
        email: row.email,
        name: row.name,
      },
    }));
  }

  public async addMember(
    organizationId: string,
    userId: string,
    role: OrganizationRole,
  ): Promise<OrganizationMembership> {
    const res = await this.pool.query<OrganizationMembership>(
      `INSERT INTO organization_memberships (organization_id, user_id, role)
       VALUES ($1, $2, $3)
       RETURNING id, organization_id as "organizationId", user_id as "userId", role,
                 created_at as "createdAt", updated_at as "updatedAt";`,
      [organizationId, userId, role],
    );
    const row = res.rows[0];
    if (!row) throw new Error('Failed to add organization member');
    return row;
  }

  public async updateMemberRole(
    organizationId: string,
    userId: string,
    role: OrganizationRole,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE organization_memberships
       SET role = $1, updated_at = CURRENT_TIMESTAMP
       WHERE organization_id = $2 AND user_id = $3;`,
      [role, organizationId, userId],
    );
  }

  public async removeMember(organizationId: string, userId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM organization_memberships WHERE organization_id = $1 AND user_id = $2;',
      [organizationId, userId],
    );
  }

  public async update(id: string, data: { name: string }): Promise<Organization> {
    const res = await this.pool.query<Organization>(
      `UPDATE organizations
       SET name = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, name, slug, created_at as "createdAt", updated_at as "updatedAt";`,
      [data.name.trim(), id],
    );
    const row = res.rows[0];
    if (!row) throw new Error('Organization not found');
    return row;
  }
}

export class InMemoryOrganizationRepository implements IOrganizationRepository {
  private organizations = new Map<string, Organization>();
  private memberships: OrganizationMembership[] = [];

  public async create(
    data: { name: string; slug: string },
    ownerUserId: string,
  ): Promise<Organization> {
    const id = crypto.randomUUID();
    const now = new Date();
    const org: Organization = {
      id,
      name: data.name.trim(),
      slug: data.slug.trim().toLowerCase(),
      createdAt: now,
      updatedAt: now,
    };
    this.organizations.set(id, org);

    this.memberships.push({
      id: crypto.randomUUID(),
      organizationId: id,
      userId: ownerUserId,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    });

    return org;
  }

  public async findById(id: string): Promise<Organization | null> {
    return this.organizations.get(id) ?? null;
  }

  public async findBySlug(slug: string): Promise<Organization | null> {
    const lower = slug.trim().toLowerCase();
    for (const org of this.organizations.values()) {
      if (org.slug.toLowerCase() === lower) return org;
    }
    return null;
  }

  public async listUserOrganizations(
    userId: string,
  ): Promise<Array<Organization & { role: OrganizationRole }>> {
    const result: Array<Organization & { role: OrganizationRole }> = [];
    for (const m of this.memberships) {
      if (m.userId === userId) {
        const org = this.organizations.get(m.organizationId);
        if (org) {
          result.push({ ...org, role: m.role });
        }
      }
    }
    return result;
  }

  public async getMembership(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembership | null> {
    const match = this.memberships.find(
      (m) => m.organizationId === organizationId && m.userId === userId,
    );
    return match ? { ...match } : null;
  }

  public async listMembers(organizationId: string): Promise<OrganizationMembership[]> {
    return this.memberships.filter((m) => m.organizationId === organizationId);
  }

  public async addMember(
    organizationId: string,
    userId: string,
    role: OrganizationRole,
  ): Promise<OrganizationMembership> {
    const now = new Date();
    const membership: OrganizationMembership = {
      id: crypto.randomUUID(),
      organizationId,
      userId,
      role,
      createdAt: now,
      updatedAt: now,
    };
    this.memberships.push(membership);
    return membership;
  }

  public async updateMemberRole(
    organizationId: string,
    userId: string,
    role: OrganizationRole,
  ): Promise<void> {
    const match = this.memberships.find(
      (m) => m.organizationId === organizationId && m.userId === userId,
    );
    if (!match) throw new Error('Membership not found');
    match.role = role;
    match.updatedAt = new Date();
  }

  public async removeMember(organizationId: string, userId: string): Promise<void> {
    this.memberships = this.memberships.filter(
      (m) => !(m.organizationId === organizationId && m.userId === userId),
    );
  }

  public async update(id: string, data: { name: string }): Promise<Organization> {
    const org = this.organizations.get(id);
    if (!org) throw new Error('Organization not found');
    org.name = data.name.trim();
    org.updatedAt = new Date();
    return { ...org };
  }
}
