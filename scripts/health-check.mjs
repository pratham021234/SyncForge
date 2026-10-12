/**
 * SyncForge Health Check Script
 * Queries the Fastify backend /healthz and /readyz endpoints.
 */

const SERVER_URL = process.env.SERVER_PUBLIC_URL || 'http://localhost:4000';

async function checkHealth() {
  console.log(`Checking SyncForge backend health at ${SERVER_URL}...`);

  try {
    const livenessRes = await fetch(`${SERVER_URL}/healthz`, { signal: AbortSignal.timeout(3000) });
    if (livenessRes.ok) {
      const data = await livenessRes.json();
      console.log('✓ Liveness Probe (/healthz): Healthy');
      console.log(
        `  Uptime: ${data.uptimeSeconds}s | Version: ${data.version} | Env: ${data.environment}`,
      );
    } else {
      console.error(`✗ Liveness Probe returned HTTP ${livenessRes.status}`);
    }
  } catch (err) {
    console.error(`✗ Failed to connect to /healthz: ${err.message}`);
  }

  try {
    const readinessRes = await fetch(`${SERVER_URL}/readyz`, { signal: AbortSignal.timeout(3000) });
    const data = await readinessRes.json();
    if (readinessRes.ok) {
      console.log('✓ Readiness Probe (/readyz): Ready');
      console.log(`  Database: ${data.dependencies.database} | Redis: ${data.dependencies.redis}`);
    } else {
      console.warn('! Readiness Probe (/readyz): Degraded / Not Ready (Dependencies may be down)');
      console.log(
        `  Database: ${data.dependencies?.database} | Redis: ${data.dependencies?.redis}`,
      );
      if (data.details) {
        console.log('  Details:', JSON.stringify(data.details, null, 2));
      }
    }
  } catch (err) {
    console.error(`✗ Failed to connect to /readyz: ${err.message}`);
  }
}

checkHealth();
