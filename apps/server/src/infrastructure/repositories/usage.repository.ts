import { Pool } from 'pg';
import { UsageDailyAggregate, UsageEvent, UsageMetric } from '../../types/control-plane.js';
import { getDatabasePool } from '../database.js';

export interface IUsageRepository {
  recordEvent(event: UsageEvent): Promise<void>;
  recordEventsBatch(events: UsageEvent[]): Promise<void>;
  getAggregatedUsage(
    projectId: string,
    from: Date,
    to: Date,
    metric?: UsageMetric,
  ): Promise<UsageDailyAggregate[]>;
  getUsageSummary(projectId: string, from: Date, to: Date): Promise<Record<UsageMetric, number>>;
  getActiveConnections(projectId: string): number;
  incrementActiveConnections(projectId: string): number;
  decrementActiveConnections(projectId: string): number;
}

export class PostgresUsageRepository implements IUsageRepository {
  private activeConnectionsMap = new Map<string, number>();

  constructor(private pool: Pool = getDatabasePool()) {}

  public async recordEvent(event: UsageEvent): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN;');

      // 1. Insert high-resolution event
      await client.query(
        `INSERT INTO usage_events (project_id, environment, metric, quantity, recorded_at, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6);`,
        [
          event.projectId,
          event.environment,
          event.metric,
          event.quantity,
          event.recordedAt,
          event.idempotencyKey ?? null,
        ],
      );

      // 2. Upsert daily aggregate
      const dateStr = event.recordedAt.toISOString().slice(0, 10); // YYYY-MM-DD
      await client.query(
        `INSERT INTO usage_daily_aggregates (project_id, environment, metric, date, total_quantity)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (project_id, environment, metric, date)
         DO UPDATE SET total_quantity = usage_daily_aggregates.total_quantity + EXCLUDED.total_quantity,
                       updated_at = CURRENT_TIMESTAMP;`,
        [event.projectId, event.environment, event.metric, dateStr, event.quantity],
      );

      await client.query('COMMIT;');
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  public async recordEventsBatch(events: UsageEvent[]): Promise<void> {
    for (const e of events) {
      await this.recordEvent(e);
    }
  }

  public async getAggregatedUsage(
    projectId: string,
    from: Date,
    to: Date,
    metric?: UsageMetric,
  ): Promise<UsageDailyAggregate[]> {
    const fromDateStr = from.toISOString().slice(0, 10);
    const toDateStr = to.toISOString().slice(0, 10);

    let query = `
      SELECT project_id as "projectId", environment, metric,
             TO_CHAR(date, 'YYYY-MM-DD') as date,
             total_quantity::BIGINT as "totalQuantity"
      FROM usage_daily_aggregates
      WHERE project_id = $1 AND date >= $2::DATE AND date <= $3::DATE
    `;
    const params: unknown[] = [projectId, fromDateStr, toDateStr];

    if (metric) {
      query += ' AND metric = $4';
      params.push(metric);
    }

    query += ' ORDER BY date ASC;';

    const res = await this.pool.query<{
      projectId: string;
      environment: UsageEvent['environment'];
      metric: UsageMetric;
      date: string;
      totalQuantity: string;
    }>(query, params);

    return res.rows.map((r) => ({
      ...r,
      totalQuantity: parseInt(r.totalQuantity, 10) || 0,
    }));
  }

  public async getUsageSummary(
    projectId: string,
    from: Date,
    to: Date,
  ): Promise<Record<UsageMetric, number>> {
    const fromDateStr = from.toISOString().slice(0, 10);
    const toDateStr = to.toISOString().slice(0, 10);

    const res = await this.pool.query<{ metric: UsageMetric; sum: string }>(
      `SELECT metric, COALESCE(SUM(total_quantity), 0) as sum
       FROM usage_daily_aggregates
       WHERE project_id = $1 AND date >= $2::DATE AND date <= $3::DATE
       GROUP BY metric;`,
      [projectId, fromDateStr, toDateStr],
    );

    const summary: Record<UsageMetric, number> = {
      connections: 0,
      room_joins: 0,
      doc_update_bytes: 0,
      persisted_bytes: 0,
    };

    for (const row of res.rows) {
      summary[row.metric] = parseInt(row.sum, 10) || 0;
    }

    return summary;
  }

  public getActiveConnections(projectId: string): number {
    return this.activeConnectionsMap.get(projectId) ?? 0;
  }

  public incrementActiveConnections(projectId: string): number {
    const current = this.getActiveConnections(projectId);
    const next = current + 1;
    this.activeConnectionsMap.set(projectId, next);
    return next;
  }

  public decrementActiveConnections(projectId: string): number {
    const current = this.getActiveConnections(projectId);
    const next = Math.max(0, current - 1);
    this.activeConnectionsMap.set(projectId, next);
    return next;
  }
}

export class InMemoryUsageRepository implements IUsageRepository {
  private events: UsageEvent[] = [];
  private dailyAggregates = new Map<string, UsageDailyAggregate>();
  private activeConnectionsMap = new Map<string, number>();

  public async recordEvent(event: UsageEvent): Promise<void> {
    this.events.push(event);

    const dateStr = event.recordedAt.toISOString().slice(0, 10);
    const key = `${event.projectId}:${event.environment}:${event.metric}:${dateStr}`;

    const existing = this.dailyAggregates.get(key);
    if (existing) {
      existing.totalQuantity += event.quantity;
    } else {
      this.dailyAggregates.set(key, {
        projectId: event.projectId,
        environment: event.environment,
        metric: event.metric,
        date: dateStr,
        totalQuantity: event.quantity,
      });
    }
  }

  public async recordEventsBatch(events: UsageEvent[]): Promise<void> {
    for (const e of events) {
      await this.recordEvent(e);
    }
  }

  public async getAggregatedUsage(
    projectId: string,
    from: Date,
    to: Date,
    metric?: UsageMetric,
  ): Promise<UsageDailyAggregate[]> {
    const fromDateStr = from.toISOString().slice(0, 10);
    const toDateStr = to.toISOString().slice(0, 10);

    const results: UsageDailyAggregate[] = [];
    for (const agg of this.dailyAggregates.values()) {
      if (
        agg.projectId === projectId &&
        agg.date >= fromDateStr &&
        agg.date <= toDateStr &&
        (!metric || agg.metric === metric)
      ) {
        results.push({ ...agg });
      }
    }

    return results.sort((a, b) => a.date.localeCompare(b.date));
  }

  public async getUsageSummary(
    projectId: string,
    from: Date,
    to: Date,
  ): Promise<Record<UsageMetric, number>> {
    const fromDateStr = from.toISOString().slice(0, 10);
    const toDateStr = to.toISOString().slice(0, 10);

    const summary: Record<UsageMetric, number> = {
      connections: 0,
      room_joins: 0,
      doc_update_bytes: 0,
      persisted_bytes: 0,
    };

    for (const agg of this.dailyAggregates.values()) {
      if (agg.projectId === projectId && agg.date >= fromDateStr && agg.date <= toDateStr) {
        summary[agg.metric] = (summary[agg.metric] ?? 0) + agg.totalQuantity;
      }
    }

    return summary;
  }

  public getActiveConnections(projectId: string): number {
    return this.activeConnectionsMap.get(projectId) ?? 0;
  }

  public incrementActiveConnections(projectId: string): number {
    const current = this.getActiveConnections(projectId);
    const next = current + 1;
    this.activeConnectionsMap.set(projectId, next);
    return next;
  }

  public decrementActiveConnections(projectId: string): number {
    const current = this.getActiveConnections(projectId);
    const next = Math.max(0, current - 1);
    this.activeConnectionsMap.set(projectId, next);
    return next;
  }
}
