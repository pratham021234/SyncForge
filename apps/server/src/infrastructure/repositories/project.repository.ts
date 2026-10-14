import crypto from 'crypto';
import { Pool } from 'pg';
import {
  Project,
  ProjectEnvironment,
  ProjectPlan,
  ProjectSettings,
} from '../../types/control-plane.js';
import { getDatabasePool } from '../database.js';

export interface IProjectRepository {
  create(data: {
    organizationId: string;
    name: string;
    slug: string;
    environment?: ProjectEnvironment;
    plan?: ProjectPlan;
    settings?: ProjectSettings;
  }): Promise<Project>;
  findById(id: string): Promise<Project | null>;
  findBySlug(slug: string): Promise<Project | null>;
  listByOrganization(organizationId: string): Promise<Project[]>;
  update(
    id: string,
    data: Partial<Pick<Project, 'name' | 'environment' | 'plan' | 'settings'>>,
  ): Promise<Project>;
  delete(id: string): Promise<void>;
}

export class PostgresProjectRepository implements IProjectRepository {
  constructor(private pool: Pool = getDatabasePool()) {}

  public async create(data: {
    organizationId: string;
    name: string;
    slug: string;
    environment?: ProjectEnvironment;
    plan?: ProjectPlan;
    settings?: ProjectSettings;
  }): Promise<Project> {
    const environment = data.environment ?? 'development';
    const plan = data.plan ?? 'free';
    const settings = JSON.stringify(data.settings ?? {});

    const res = await this.pool.query<Project>(
      `INSERT INTO projects (organization_id, name, slug, environment, plan, settings)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, organization_id as "organizationId", name, slug, environment, plan, settings,
                 created_at as "createdAt", updated_at as "updatedAt";`,
      [
        data.organizationId,
        data.name.trim(),
        data.slug.trim().toLowerCase(),
        environment,
        plan,
        settings,
      ],
    );

    const row = res.rows[0];
    if (!row) throw new Error('Failed to create project record');
    return row;
  }

  public async findById(id: string): Promise<Project | null> {
    const res = await this.pool.query<Project>(
      `SELECT id, organization_id as "organizationId", name, slug, environment, plan, settings,
              created_at as "createdAt", updated_at as "updatedAt"
       FROM projects WHERE id = $1 LIMIT 1;`,
      [id],
    );
    return res.rows[0] ?? null;
  }

  public async findBySlug(slug: string): Promise<Project | null> {
    const res = await this.pool.query<Project>(
      `SELECT id, organization_id as "organizationId", name, slug, environment, plan, settings,
              created_at as "createdAt", updated_at as "updatedAt"
       FROM projects WHERE LOWER(slug) = LOWER($1) LIMIT 1;`,
      [slug.trim()],
    );
    return res.rows[0] ?? null;
  }

  public async listByOrganization(organizationId: string): Promise<Project[]> {
    const res = await this.pool.query<Project>(
      `SELECT id, organization_id as "organizationId", name, slug, environment, plan, settings,
              created_at as "createdAt", updated_at as "updatedAt"
       FROM projects WHERE organization_id = $1
       ORDER BY created_at ASC;`,
      [organizationId],
    );
    return res.rows;
  }

  public async update(
    id: string,
    data: Partial<Pick<Project, 'name' | 'environment' | 'plan' | 'settings'>>,
  ): Promise<Project> {
    const current = await this.findById(id);
    if (!current) throw new Error('Project not found');

    const name = data.name !== undefined ? data.name.trim() : current.name;
    const environment = data.environment ?? current.environment;
    const plan = data.plan ?? current.plan;
    const settings = JSON.stringify(data.settings ?? current.settings);

    const res = await this.pool.query<Project>(
      `UPDATE projects
       SET name = $1, environment = $2, plan = $3, settings = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, organization_id as "organizationId", name, slug, environment, plan, settings,
                 created_at as "createdAt", updated_at as "updatedAt";`,
      [name, environment, plan, settings, id],
    );

    const row = res.rows[0];
    if (!row) throw new Error('Failed to update project');
    return row;
  }

  public async delete(id: string): Promise<void> {
    await this.pool.query('DELETE FROM projects WHERE id = $1;', [id]);
  }
}

export class InMemoryProjectRepository implements IProjectRepository {
  private projects = new Map<string, Project>();

  public async create(data: {
    organizationId: string;
    name: string;
    slug: string;
    environment?: ProjectEnvironment;
    plan?: ProjectPlan;
    settings?: ProjectSettings;
  }): Promise<Project> {
    const id = crypto.randomUUID();
    const now = new Date();
    const project: Project = {
      id,
      organizationId: data.organizationId,
      name: data.name.trim(),
      slug: data.slug.trim().toLowerCase(),
      environment: data.environment ?? 'development',
      plan: data.plan ?? 'free',
      settings: data.settings ?? {},
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(id, project);
    return project;
  }

  public async findById(id: string): Promise<Project | null> {
    return this.projects.get(id) ?? null;
  }

  public async findBySlug(slug: string): Promise<Project | null> {
    const lower = slug.trim().toLowerCase();
    for (const project of this.projects.values()) {
      if (project.slug.toLowerCase() === lower) return project;
    }
    return null;
  }

  public async listByOrganization(organizationId: string): Promise<Project[]> {
    return Array.from(this.projects.values()).filter((p) => p.organizationId === organizationId);
  }

  public async update(
    id: string,
    data: Partial<Pick<Project, 'name' | 'environment' | 'plan' | 'settings'>>,
  ): Promise<Project> {
    const project = this.projects.get(id);
    if (!project) throw new Error('Project not found');

    if (data.name !== undefined) project.name = data.name.trim();
    if (data.environment !== undefined) project.environment = data.environment;
    if (data.plan !== undefined) project.plan = data.plan;
    if (data.settings !== undefined) project.settings = data.settings;
    project.updatedAt = new Date();

    return { ...project };
  }

  public async delete(id: string): Promise<void> {
    this.projects.delete(id);
  }
}
