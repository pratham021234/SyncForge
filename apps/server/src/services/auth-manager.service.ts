import {
  IUserRepository,
  InMemoryUserRepository,
  PostgresUserRepository,
} from '../infrastructure/repositories/user.repository.js';
import {
  IOrganizationRepository,
  InMemoryOrganizationRepository,
  PostgresOrganizationRepository,
} from '../infrastructure/repositories/organization.repository.js';
import {
  IProjectRepository,
  InMemoryProjectRepository,
  PostgresProjectRepository,
} from '../infrastructure/repositories/project.repository.js';
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
import {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashToken,
  signJwt,
  verifyJwt,
  generateApiKey,
} from '../utils/crypto.utils.js';
import { env } from '../config/env.js';
import { User, Organization, Project } from '../types/control-plane.js';

export interface UserSessionPayload {
  userId: string;
  email: string;
  name: string;
}

export class AuthManagerService {
  constructor(
    private userRepo: IUserRepository = env.NODE_ENV === 'test'
      ? new InMemoryUserRepository()
      : new PostgresUserRepository(),
    private orgRepo: IOrganizationRepository = env.NODE_ENV === 'test'
      ? new InMemoryOrganizationRepository()
      : new PostgresOrganizationRepository(),
    private projectRepo: IProjectRepository = env.NODE_ENV === 'test'
      ? new InMemoryProjectRepository()
      : new PostgresProjectRepository(),
    private apiKeyRepo: IApiKeyRepository = env.NODE_ENV === 'test'
      ? new InMemoryApiKeyRepository()
      : new PostgresApiKeyRepository(),
    private auditRepo: IAuditRepository = env.NODE_ENV === 'test'
      ? new InMemoryAuditRepository()
      : new PostgresAuditRepository(),
  ) {}

  public async register(data: {
    email: string;
    password: string;
    name: string;
    ipAddress?: string;
  }): Promise<{
    user: Omit<User, 'passwordHash'>;
    organization: Organization;
    project: Project;
    initialApiKey: string;
    token: string;
  }> {
    const cleanEmail = data.email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || cleanEmail.length < 5) {
      throw new Error('Please provide a valid email address');
    }
    if (!data.password || data.password.length < 8) {
      throw new Error('Password must be at least 8 characters in length');
    }
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Please provide your name');
    }

    const existing = await this.userRepo.findByEmail(cleanEmail);
    if (existing) {
      throw new Error('An account with this email address already exists');
    }

    // 1. Hash password with scrypt
    const passwordHash = hashPassword(data.password);

    // 2. Create User
    const user = await this.userRepo.create({
      email: cleanEmail,
      passwordHash,
      name: data.name.trim(),
    });

    // 3. Create Default Organization
    const orgSlug = `org-${
      cleanEmail
        .split('@')[0]
        ?.replace(/[^a-z0-9]/gi, '')
        .toLowerCase() || 'main'
    }-${user.id.slice(0, 6)}`;
    const organization = await this.orgRepo.create(
      {
        name: `${data.name.trim()}'s Workspace`,
        slug: orgSlug,
      },
      user.id,
    );

    // 4. Create Default Project
    const project = await this.projectRepo.create({
      organizationId: organization.id,
      name: 'Default Project',
      slug: `default-project-${user.id.slice(0, 6)}`,
      environment: 'development',
      plan: 'free',
    });

    // 5. Generate Initial API Key
    const { rawKey, keyPrefix, keyHash } = generateApiKey('development');
    await this.apiKeyRepo.create({
      projectId: project.id,
      keyHash,
      keyPrefix,
      name: 'Default Dev Secret Key',
      environment: 'development',
      keyType: 'secret',
      scopes: ['rooms:read', 'rooms:write'],
    });

    // 6. Record Audit Log
    await this.auditRepo.record({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      action: 'auth.register',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { email: cleanEmail },
      ipAddress: data.ipAddress ?? null,
    });

    // 7. Sign Session Token
    const token = this.createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    const { passwordHash: _, ...safeUser } = user;

    return {
      user: safeUser,
      organization,
      project,
      initialApiKey: rawKey,
      token,
    };
  }

  public async login(data: { email: string; password: string; ipAddress?: string }): Promise<{
    user: Omit<User, 'passwordHash'>;
    token: string;
  }> {
    const cleanEmail = data.email.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(cleanEmail);

    if (!user || !verifyPassword(data.password, user.passwordHash)) {
      throw new Error('Invalid email or password');
    }

    await this.auditRepo.record({
      organizationId: null,
      projectId: null,
      actorUserId: user.id,
      action: 'auth.login',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { email: cleanEmail },
      ipAddress: data.ipAddress ?? null,
    });

    const token = this.createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    const { passwordHash: _, ...safeUser } = user;

    return {
      user: safeUser,
      token,
    };
  }

  public async getMe(userId: string): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  public async requestPasswordReset(data: {
    email: string;
    ipAddress?: string;
  }): Promise<{ message: string; resetToken?: string }> {
    const cleanEmail = data.email.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(cleanEmail);

    if (!user) {
      // Do not reveal email non-existence to prevent user enumeration attacks
      return {
        message:
          'If an account exists with this email address, a password reset link has been dispatched.',
      };
    }

    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour expiry

    await this.userRepo.savePasswordResetToken(user.id, tokenHash, expiresAt);

    await this.auditRepo.record({
      organizationId: null,
      projectId: null,
      actorUserId: user.id,
      action: 'auth.password_reset_request',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { email: cleanEmail },
      ipAddress: data.ipAddress ?? null,
    });

    const response: { message: string; resetToken?: string } = {
      message:
        'If an account exists with this email address, a password reset link has been dispatched.',
    };

    // In local development or testing without SMTP, expose token for testing convenience
    if (env.NODE_ENV !== 'production') {
      response.resetToken = rawToken;
    }

    return response;
  }

  public async confirmPasswordReset(data: {
    token: string;
    newPassword: string;
    ipAddress?: string;
  }): Promise<{ success: boolean; message: string }> {
    if (!data.newPassword || data.newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters in length');
    }

    const tokenHash = hashToken(data.token);
    const resetRecord = await this.userRepo.findPasswordResetToken(tokenHash);

    if (!resetRecord) {
      throw new Error('Invalid or expired password reset token');
    }

    if (resetRecord.usedAt !== null) {
      throw new Error('This password reset token has already been used');
    }

    if (resetRecord.expiresAt.getTime() < Date.now()) {
      throw new Error('This password reset token has expired');
    }

    const newHash = hashPassword(data.newPassword);
    await this.userRepo.updatePassword(resetRecord.userId, newHash);
    await this.userRepo.markPasswordResetTokenUsed(resetRecord.id);

    await this.auditRepo.record({
      organizationId: null,
      projectId: null,
      actorUserId: resetRecord.userId,
      action: 'auth.password_reset_confirm',
      resourceType: 'user',
      resourceId: resetRecord.userId,
      metadata: {},
      ipAddress: data.ipAddress ?? null,
    });

    return {
      success: true,
      message: 'Password successfully updated. You can now log in with your new credentials.',
    };
  }

  public createSessionToken(payload: UserSessionPayload, expiresInSeconds = 86400 * 7): string {
    return signJwt(
      payload as unknown as Record<string, unknown>,
      env.AUTH_SECRET,
      expiresInSeconds,
    );
  }

  public verifySessionToken(token: string): UserSessionPayload {
    return verifyJwt<UserSessionPayload>(token, env.AUTH_SECRET);
  }
}
