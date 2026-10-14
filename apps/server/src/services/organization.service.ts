import {
  IOrganizationRepository,
  InMemoryOrganizationRepository,
  PostgresOrganizationRepository,
} from '../infrastructure/repositories/organization.repository.js';
import {
  IUserRepository,
  InMemoryUserRepository,
  PostgresUserRepository,
} from '../infrastructure/repositories/user.repository.js';
import {
  IAuditRepository,
  InMemoryAuditRepository,
  PostgresAuditRepository,
} from '../infrastructure/repositories/audit.repository.js';
import { env } from '../config/env.js';
import {
  Organization,
  OrganizationMembership,
  OrganizationRole,
  AuditLog,
} from '../types/control-plane.js';

export class OrganizationService {
  constructor(
    private orgRepo: IOrganizationRepository = env.NODE_ENV === 'test'
      ? new InMemoryOrganizationRepository()
      : new PostgresOrganizationRepository(),
    private userRepo: IUserRepository = env.NODE_ENV === 'test'
      ? new InMemoryUserRepository()
      : new PostgresUserRepository(),
    private auditRepo: IAuditRepository = env.NODE_ENV === 'test'
      ? new InMemoryAuditRepository()
      : new PostgresAuditRepository(),
  ) {}

  public async createOrganization(data: {
    name: string;
    slug?: string;
    userId: string;
    ipAddress?: string;
  }): Promise<Organization> {
    const slug =
      (data.slug || data.name)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) + `-${Math.random().toString(36).slice(2, 6)}`;

    const org = await this.orgRepo.create({ name: data.name, slug }, data.userId);

    await this.auditRepo.record({
      organizationId: org.id,
      projectId: null,
      actorUserId: data.userId,
      action: 'organization.create',
      resourceType: 'organization',
      resourceId: org.id,
      metadata: { name: org.name, slug: org.slug },
      ipAddress: data.ipAddress ?? null,
    });

    return org;
  }

  public async getUserOrganizations(
    userId: string,
  ): Promise<Array<Organization & { role: OrganizationRole }>> {
    return this.orgRepo.listUserOrganizations(userId);
  }

  public async getOrganization(
    organizationId: string,
    userId: string,
  ): Promise<Organization & { role: OrganizationRole }> {
    const membership = await this.orgRepo.getMembership(organizationId, userId);
    if (!membership) {
      throw new Error('Unauthorized: You do not have access to this organization');
    }
    const org = await this.orgRepo.findById(organizationId);
    if (!org) {
      throw new Error('Organization not found');
    }
    return { ...org, role: membership.role };
  }

  public async updateOrganization(data: {
    organizationId: string;
    name: string;
    userId: string;
    ipAddress?: string;
  }): Promise<Organization> {
    const membership = await this.orgRepo.getMembership(data.organizationId, data.userId);
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new Error('Unauthorized: Only organization owners and admins can update settings');
    }

    const updated = await this.orgRepo.update(data.organizationId, { name: data.name });

    await this.auditRepo.record({
      organizationId: data.organizationId,
      projectId: null,
      actorUserId: data.userId,
      action: 'organization.update',
      resourceType: 'organization',
      resourceId: data.organizationId,
      metadata: { name: updated.name },
      ipAddress: data.ipAddress ?? null,
    });

    return updated;
  }

  public async listMembers(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembership[]> {
    const membership = await this.orgRepo.getMembership(organizationId, userId);
    if (!membership) {
      throw new Error('Unauthorized: You do not have access to this organization');
    }
    return this.orgRepo.listMembers(organizationId);
  }

  public async addMember(data: {
    organizationId: string;
    email: string;
    role: OrganizationRole;
    actorUserId: string;
    ipAddress?: string;
  }): Promise<OrganizationMembership> {
    const actorMembership = await this.orgRepo.getMembership(data.organizationId, data.actorUserId);
    if (!actorMembership || !['owner', 'admin'].includes(actorMembership.role)) {
      throw new Error('Unauthorized: Only organization owners and admins can invite members');
    }

    const targetUser = await this.userRepo.findByEmail(data.email.trim());
    if (!targetUser) {
      throw new Error(
        'User not found. The invited user must register for a SyncForge account first.',
      );
    }

    const existingMembership = await this.orgRepo.getMembership(data.organizationId, targetUser.id);
    if (existingMembership) {
      throw new Error('User is already a member of this organization');
    }

    const membership = await this.orgRepo.addMember(data.organizationId, targetUser.id, data.role);

    await this.auditRepo.record({
      organizationId: data.organizationId,
      projectId: null,
      actorUserId: data.actorUserId,
      action: 'member.add',
      resourceType: 'membership',
      resourceId: membership.id,
      metadata: { targetUserId: targetUser.id, email: targetUser.email, role: data.role },
      ipAddress: data.ipAddress ?? null,
    });

    return {
      ...membership,
      user: {
        email: targetUser.email,
        name: targetUser.name,
      },
    };
  }

  public async removeMember(data: {
    organizationId: string;
    targetUserId: string;
    actorUserId: string;
    ipAddress?: string;
  }): Promise<void> {
    const actorMembership = await this.orgRepo.getMembership(data.organizationId, data.actorUserId);
    if (!actorMembership || !['owner', 'admin'].includes(actorMembership.role)) {
      throw new Error('Unauthorized: Only organization owners and admins can remove members');
    }

    const targetMembership = await this.orgRepo.getMembership(
      data.organizationId,
      data.targetUserId,
    );
    if (!targetMembership) {
      throw new Error('Member not found in organization');
    }

    if (targetMembership.role === 'owner') {
      const allMembers = await this.orgRepo.listMembers(data.organizationId);
      const ownerCount = allMembers.filter((m) => m.role === 'owner').length;
      if (ownerCount <= 1) {
        throw new Error('Cannot remove the sole owner of an organization');
      }
    }

    await this.orgRepo.removeMember(data.organizationId, data.targetUserId);

    await this.auditRepo.record({
      organizationId: data.organizationId,
      projectId: null,
      actorUserId: data.actorUserId,
      action: 'member.remove',
      resourceType: 'membership',
      resourceId: targetMembership.id,
      metadata: { targetUserId: data.targetUserId },
      ipAddress: data.ipAddress ?? null,
    });
  }

  public async listAuditLogs(
    organizationId: string,
    userId: string,
    limit = 50,
  ): Promise<AuditLog[]> {
    const membership = await this.orgRepo.getMembership(organizationId, userId);
    if (!membership) {
      throw new Error('Unauthorized: You do not have access to this organization');
    }
    return this.auditRepo.listByOrganization(organizationId, limit);
  }
}
