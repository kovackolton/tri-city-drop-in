import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

// Run from apps/api: node --env-file=.env --import tsx test/share-container-smoke.ts [image-tag]
// Uses only a temporary schema in local PostgreSQL and a uniquely named local container.
async function main() {
  assert.ok(process.env.DATABASE_URL, 'Load the API local .env first.');
  const original = new URL(process.env.DATABASE_URL!);
  assert.ok(['localhost', '127.0.0.1'].includes(original.hostname), 'This smoke test requires local PostgreSQL.');
  const suffix = randomUUID().replaceAll('-', ''), schema = `share_smoke_${suffix}`, container = `tri-city-share-smoke-${suffix}`;
  const url = new URL(original); url.searchParams.set('schema', schema); url.searchParams.set('connection_limit', '3');
  const dockerUrl = new URL(url); dockerUrl.hostname = 'host.docker.internal';
  const admin = new PrismaClient(), db = new PrismaClient({ datasourceUrl: url.toString() });
  let started = false, stage = 'migrations';
  function docker(args: string[], env: NodeJS.ProcessEnv = process.env) {
    try { return execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe', env }).trim(); }
    catch { throw new Error('Local Docker operation failed during ' + stage); }
  }
  try {
    execFileSync(process.execPath, [resolve('../../node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe' });
    const owner = await db.user.create({ data: { firebaseUid: suffix, email: `${suffix}@example.invalid`, displayName: 'Container test owner', role: 'ORGANIZER' } });
    const location = await db.location.create({ data: { name: 'Smoke venue', address: 'Local test pitch', timezone: 'America/New_York' } });
    const event = await db.event.create({ data: { title: 'Container soccer', organizerId: owner.id, locationId: location.id, capacity: 4, priceCents: 1200, status: 'PUBLISHED', startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 90000000) } });
    stage = 'container startup';
    docker(['run', '-d', '--name', container, '-p', '127.0.0.1::9090', '-e', 'PORT=9090', '-e', 'PUBLIC_SITE_ORIGIN=https://soccer.example.test', '-e', 'DATABASE_URL', process.argv[2] ?? 'tri-city-drop-in:cloudrun-preview'], { ...process.env, DATABASE_URL: dockerUrl.toString() }); started = true;
    const address = docker(['port', container, '9090/tcp']); assert.match(address, /^127\.0\.0\.1:\d+$/); const base = 'http://' + address;
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) { try { const response = await fetch(base + '/api/health'); if (response.ok) { ready = true; break; } } catch { /* Wait for this test container only. */ } await new Promise(resolve => setTimeout(resolve, 500)); }
    assert.ok(ready, 'Container must listen on the injected PORT.');
    stage = 'HTTP checks';
    const page = await fetch(`${base}/games/${event.id}`); assert.equal(page.status, 200); const html = await page.text(); assert.ok(html.includes('property="og:title"')); assert.ok(html.includes('4 spots available')); assert.ok(html.includes('USD 12.00')); assert.ok(html.includes('https://soccer.example.test/?event=' + event.id));
    const root = await fetch(base + '/'); assert.equal(root.status, 200); assert.ok((await root.text()).includes('<app-root>'));
    assert.equal((await fetch(base + '/styles.css')).status, 200);
    const fallback = await fetch(base + '/share/soccer-ball.png'); assert.equal(fallback.headers.get('content-type'), 'image/png'); assert.equal(Buffer.from(await fallback.arrayBuffer()).readUInt32BE(16), 1200);
    const config = await fetch(base + '/config.json'); assert.equal(config.status, 200); assert.deepEqual(await config.json(), { firebase: {} });
    const game = await fetch(`${base}/api/public/games/${event.id}`); assert.equal(game.status, 200);
    assert.equal((await fetch(base + '/api/me/strikes')).status, 401);
    await db.event.update({ where: { id: event.id }, data: { status: 'CANCELLED' } });
    assert.ok((await (await fetch(`${base}/games/${event.id}`)).text()).includes('Cancelled')); assert.equal((await fetch(`${base}/api/public/games/${event.id}`)).status, 404);
    console.log('Combined Cloud Run-style container passed: injected port, HTML metadata, live availability, Angular/static assets, public config and protected API.');
  } finally {
    stage = 'cleanup';
    if (started) docker(['rm', '-f', container]);
    await db.$disconnect(); assert.match(schema, /^share_smoke_[a-f0-9]{32}$/);
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect();
  }
}
void main().catch(() => { console.error('Local container smoke test failed. No cloud deployment was attempted.'); process.exitCode = 1; });
