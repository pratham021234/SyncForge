import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryUsageRepository } from '../infrastructure/repositories/usage.repository.js';
import { InMemoryProjectRepository } from '../infrastructure/repositories/project.repository.js';
import { InMemoryOrganizationRepository } from '../infrastructure/repositories/organization.repository.js';
import { UsageService } from '../services/usage.service.js';

describe('Usage Metering & Plan Limits Enforcement', () => {
  let usageRepo: InMemoryUsageRepository;
  let projectRepo: InMemoryProjectRepository;
  let orgRepo: InMemoryOrganizationRepository;
  let usageService: UsageService;
  let projectId: string;
  let userId: string;

  beforeEach(async () => {
    usageRepo = new InMemoryUsageRepository();
    projectRepo = new InMemoryProjectRepository();
    orgRepo = new InMemoryOrganizationRepository();
    usageService = new UsageService(usageRepo, projectRepo, orgRepo);

    userId = 'usr_test_metering_1';
    const org = await orgRepo.create({ name: 'Metering Test Org', slug: 'metering-org' }, userId);
    const project = await projectRepo.create({
      organizationId: org.id,
      name: 'Metering Project',
      slug: 'metering-proj',
      plan: 'free',
    });
    projectId = project.id;
  });

  it('records connection, room_join, and document update byte events accurately', async () => {
    // 1. Record 2 connections
    await usageService.recordConnection(projectId);
    await usageService.recordConnection(projectId);

    // 2. Record 3 room joins
    await usageService.recordRoomJoin(projectId);
    await usageService.recordRoomJoin(projectId);
    await usageService.recordRoomJoin(projectId);

    // 3. Record document update bytes
    await usageService.recordDocUpdateBytes(projectId, 1024);
    await usageService.recordDocUpdateBytes(projectId, 2048);

    // 4. Query usage summary
    const usage = await usageService.getProjectUsage({
      projectId,
      userId,
    });

    expect(usage.summary.connections).toBe(2);
    expect(usage.summary.room_joins).toBe(3);
    expect(usage.summary.doc_update_bytes).toBe(3072);
    expect(usage.plan.planName).toBe('free');
    expect(usage.plan.maxConnections).toBe(50);
    expect(usage.plan.activeConnections).toBe(2);

    // 5. Simulate 1 connection disconnect
    usageService.recordConnectionClose(projectId);
    const updatedUsage = await usageService.getProjectUsage({
      projectId,
      userId,
    });
    expect(updatedUsage.plan.activeConnections).toBe(1);
  });

  it('enforces plan concurrency limits when maximum active connections are exceeded', async () => {
    // Free plan allows 50 connections
    for (let i = 0; i < 50; i++) {
      const check = await usageService.checkPlanLimits(projectId);
      expect(check.allowed).toBe(true);
      await usageService.recordConnection(projectId);
    }

    // 51st connection should be rejected
    const overLimitCheck = await usageService.checkPlanLimits(projectId);
    expect(overLimitCheck.allowed).toBe(false);
    expect(overLimitCheck.reason).toContain('maximum concurrent connection limit (50)');
  });

  it('aggregates daily metrics for historical reporting without double-counting', async () => {
    await usageService.recordEvent({
      projectId,
      metric: 'doc_update_bytes',
      quantity: 500,
    });
    await usageService.recordEvent({
      projectId,
      metric: 'doc_update_bytes',
      quantity: 750,
    });

    const now = new Date();
    const from = new Date(now.getTime() - 24 * 3600 * 1000);
    const to = new Date(now.getTime() + 24 * 3600 * 1000);

    const aggregates = await usageRepo.getAggregatedUsage(projectId, from, to, 'doc_update_bytes');
    expect(aggregates.length).toBe(1);
    expect(aggregates[0]?.totalQuantity).toBe(1250);
  });
});
