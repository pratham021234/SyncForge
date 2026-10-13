-- Migration: 002_document_snapshots.sql
-- Description: Creates document_snapshots table for CRDT compaction and quick state reconstruction.

BEGIN;

CREATE TABLE IF NOT EXISTS document_snapshots (
  id BIGSERIAL PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL UNIQUE,
  snapshot_data BYTEA NOT NULL,
  last_update_id BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_document_snapshots_room ON document_snapshots (room_id);

COMMIT;
