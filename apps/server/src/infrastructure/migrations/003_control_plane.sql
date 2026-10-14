-- Migration: 003_control_plane.sql
-- Description: Multi-tenant control plane schema: organizations, users, memberships, enhanced projects, API keys, usage metering, and audit logs.

BEGIN;

-- 1. Organizations (Workspaces / Tenants)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations (slug);

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- 3. Password Reset Tokens (Single-use, expiring)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash ON password_reset_tokens (token_hash);

-- 4. Organization Memberships (Role-Based Access Control)
CREATE TABLE IF NOT EXISTS organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member', 'viewer'
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON organization_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON organization_memberships (organization_id);

-- 5. Enhance Projects Table with Organization Link and Plan/Environment
ALTER TABLE projects ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS environment VARCHAR(20) NOT NULL DEFAULT 'development';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'free';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_projects_org ON projects (organization_id);

-- 6. Enhance API Keys Table with Environment, Type, and Scopes
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS environment VARCHAR(20) NOT NULL DEFAULT 'development';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_type VARCHAR(20) NOT NULL DEFAULT 'secret'; -- 'secret' or 'publishable'
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT '{"rooms:read", "rooms:write"}';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- 7. Usage Events Table (High-resolution server-observed events)
CREATE TABLE IF NOT EXISTS usage_events (
  id BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment VARCHAR(20) NOT NULL DEFAULT 'development',
  metric VARCHAR(50) NOT NULL, -- 'connections', 'room_joins', 'doc_update_bytes', 'persisted_bytes'
  quantity BIGINT NOT NULL DEFAULT 1,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  idempotency_key VARCHAR(128)
);

CREATE INDEX IF NOT EXISTS idx_usage_events_project_time ON usage_events (project_id, recorded_at ASC);
CREATE INDEX IF NOT EXISTS idx_usage_events_metric ON usage_events (metric);

-- 8. Daily Aggregated Usage Table (Fast dashboard queries)
CREATE TABLE IF NOT EXISTS usage_daily_aggregates (
  id BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment VARCHAR(20) NOT NULL DEFAULT 'development',
  metric VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  total_quantity BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, environment, metric, date)
);

CREATE INDEX IF NOT EXISTS idx_usage_daily_project_date ON usage_daily_aggregates (project_id, date ASC);

-- 9. Audit Logs Table (Administrative and Security Visibility)
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(100),
  metadata JSONB NOT NULL DEFAULT '{}',
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_project ON audit_logs (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor_user_id, created_at DESC);

COMMIT;
