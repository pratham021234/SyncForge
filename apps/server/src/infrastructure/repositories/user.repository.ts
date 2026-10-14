import crypto from 'crypto';
import { Pool } from 'pg';
import { User, PasswordResetToken } from '../../types/control-plane.js';
import { getDatabasePool } from '../database.js';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: { email: string; passwordHash: string; name: string }): Promise<User>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  savePasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<PasswordResetToken>;
  findPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | null>;
  markPasswordResetTokenUsed(tokenId: string): Promise<void>;
}

export class PostgresUserRepository implements IUserRepository {
  constructor(private pool: Pool = getDatabasePool()) {}

  public async findById(id: string): Promise<User | null> {
    const res = await this.pool.query<User>(
      'SELECT id, email, password_hash as "passwordHash", name, email_verified_at as "emailVerifiedAt", created_at as "createdAt", updated_at as "updatedAt" FROM users WHERE id = $1 LIMIT 1;',
      [id],
    );
    return res.rows[0] ?? null;
  }

  public async findByEmail(email: string): Promise<User | null> {
    const res = await this.pool.query<User>(
      'SELECT id, email, password_hash as "passwordHash", name, email_verified_at as "emailVerifiedAt", created_at as "createdAt", updated_at as "updatedAt" FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1;',
      [email.trim()],
    );
    return res.rows[0] ?? null;
  }

  public async create(data: { email: string; passwordHash: string; name: string }): Promise<User> {
    const res = await this.pool.query<User>(
      `INSERT INTO users (email, password_hash, name)
       VALUES (LOWER($1), $2, $3)
       RETURNING id, email, password_hash as "passwordHash", name, email_verified_at as "emailVerifiedAt", created_at as "createdAt", updated_at as "updatedAt";`,
      [data.email.trim(), data.passwordHash, data.name.trim()],
    );
    const row = res.rows[0];
    if (!row) throw new Error('Failed to create user record');
    return row;
  }

  public async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;',
      [passwordHash, userId],
    );
  }

  public async savePasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<PasswordResetToken> {
    const res = await this.pool.query<PasswordResetToken>(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id, user_id as "userId", token_hash as "tokenHash", expires_at as "expiresAt", used_at as "usedAt", created_at as "createdAt";`,
      [userId, tokenHash, expiresAt],
    );
    const row = res.rows[0];
    if (!row) throw new Error('Failed to save reset token');
    return row;
  }

  public async findPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | null> {
    const res = await this.pool.query<PasswordResetToken>(
      'SELECT id, user_id as "userId", token_hash as "tokenHash", expires_at as "expiresAt", used_at as "usedAt", created_at as "createdAt" FROM password_reset_tokens WHERE token_hash = $1 LIMIT 1;',
      [tokenHash],
    );
    return res.rows[0] ?? null;
  }

  public async markPasswordResetTokenUsed(tokenId: string): Promise<void> {
    await this.pool.query(
      'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1;',
      [tokenId],
    );
  }
}

export class InMemoryUserRepository implements IUserRepository {
  private users = new Map<string, User>();
  private resetTokens = new Map<string, PasswordResetToken>();

  public async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  public async findByEmail(email: string): Promise<User | null> {
    const lower = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === lower) return user;
    }
    return null;
  }

  public async create(data: { email: string; passwordHash: string; name: string }): Promise<User> {
    if (await this.findByEmail(data.email)) {
      throw new Error('A user with this email address already exists');
    }
    const id = crypto.randomUUID();
    const now = new Date();
    const user: User = {
      id,
      email: data.email.trim().toLowerCase(),
      passwordHash: data.passwordHash,
      name: data.name.trim(),
      emailVerifiedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, user);
    return user;
  }

  public async updatePassword(userId: string, passwordHash: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    user.passwordHash = passwordHash;
    user.updatedAt = new Date();
  }

  public async savePasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<PasswordResetToken> {
    const id = crypto.randomUUID();
    const token: PasswordResetToken = {
      id,
      userId,
      tokenHash,
      expiresAt,
      usedAt: null,
      createdAt: new Date(),
    };
    this.resetTokens.set(tokenHash, token);
    return token;
  }

  public async findPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | null> {
    return this.resetTokens.get(tokenHash) ?? null;
  }

  public async markPasswordResetTokenUsed(tokenId: string): Promise<void> {
    for (const token of this.resetTokens.values()) {
      if (token.id === tokenId) {
        token.usedAt = new Date();
        break;
      }
    }
  }
}
