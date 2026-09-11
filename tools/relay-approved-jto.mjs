/**
 * One-shot relay for an authorized JTO/SKT export. No scraping or login bypass.
 * Requires Node.js 20+. Keep the export OUTSIDE the application's public directory.
 *
 * Validate: JTO_APPROVED_SCOPE_ID=<agreed-area-id> node tools/relay-approved-jto.mjs /private/export.json --check
 * Send:     JTO_APPROVED_SCOPE_ID=<agreed-area-id> INGEST_TOKEN=<secret> node tools/relay-approved-jto.mjs /private/export.json
 * Self-test: node tools/relay-approved-jto.mjs --self-test
 *
 * Required source metadata: parkId='981', source='JTO_SKT_REALTIME',
 * metric='instantaneous-population', scopeType='park-boundary', scopeId=<agreed-area-id>,
 * observedAt=<ISO timestamp including timezone>, people={total,locals,tourists}.
 * scopeType/scopeId MUST describe the actual agreed measurement area, not be invented.
 * A 1.5-km neighbourhood, daily arrivals or monthly/card statistics cannot be sent
 * as the park's current population. Re-exporting a stale file never refreshes its time.
 */
import { readFile } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const DESTINATION = 'https://jeju-now-981.onrender.com/api/v1/ingest/skt';
const MAX_AGE_MS = 15 * 60_000;
const MAX_FILE_BYTES = 64_000;
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function validateRecord(record, approvedScopeId, now = Date.now()) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('JSON object required');
  if (!approvedScopeId?.trim()) throw new Error('JTO_APPROVED_SCOPE_ID is required; verify the source area first');
  if (record.parkId !== '981' || record.source !== 'JTO_SKT_REALTIME') throw new Error('wrong park or source');
  if (record.metric !== 'instantaneous-population') throw new Error('current population metric required; not daily/monthly data');
  if (record.scopeType !== 'park-boundary' || record.scopeId !== approvedScopeId) throw new Error('source area does not match the approved park boundary');
  if (typeof record.observedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(record.observedAt)) {
    throw new Error('observedAt must be the source ISO timestamp including timezone');
  }
  const observed = Date.parse(record.observedAt);
  const age = now - observed;
  if (!Number.isFinite(observed) || age > MAX_AGE_MS || age < -60_000) throw new Error('source timestamp is stale, invalid or in the future');
  const p = record.people;
  if (!p || !['total', 'locals', 'tourists'].every(k => Number.isSafeInteger(p[k]) && p[k] >= 0)) {
    throw new Error('all three population counts must be non-negative safe integers; missing counts are not guessed');
  }
  if (p.locals + p.tourists !== p.total) throw new Error('locals + tourists must equal total');
  return {
    parkId: '981', source: 'JTO_SKT_REALTIME', observedAt: record.observedAt,
    people: { total: p.total, locals: p.locals, tourists: p.tourists }
  };
}

export async function sendRecord(payload, token, request = fetch) {
  if (typeof token !== 'string' || token.trim().length < 24) throw new Error('set the Render INGEST_TOKEN securely in the relay environment');
  const response = await request(DESTINATION, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12_000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`receiver rejected the record (HTTP ${response.status}); no automatic retries`);
  const text = await response.text();
  if (text.length > MAX_FILE_BYTES) throw new Error('receiver response is too large');
  const result = JSON.parse(text);
  if (result.ok !== true || result.anchor?.total !== payload.people.total ||
      Date.parse(result.anchor?.observedAt) !== Date.parse(payload.observedAt)) {
    throw new Error('receiver did not acknowledge this exact observation');
  }
  return { ok: true, observedAt: payload.observedAt, total: payload.people.total };
}

async function selfTest() {
  const now = Date.parse('2026-09-11T06:00:00Z');
  const base = {
    parkId: '981', source: 'JTO_SKT_REALTIME', metric: 'instantaneous-population',
    scopeType: 'park-boundary', scopeId: 'TEST-ONLY-AREA',
    observedAt: '2026-09-11T05:59:00Z', people: { total: 10, locals: 3, tourists: 7 }
  };
  const valid = validateRecord(base, 'TEST-ONLY-AREA', now);
  assert.equal(valid.people.total, 10);
  let passed = 1;
  for (const patch of [
    { parkId: 'other' }, { source: 'DEMO' }, { metric: 'monthly-visitors' },
    { scopeType: 'neighbourhood-1500m' }, { scopeId: 'OTHER' },
    { observedAt: '' }, { observedAt: '2026-09-11T05:00:00Z' },
    { observedAt: '2026-09-11T06:10:00Z' }, { observedAt: '2026-09-11T06:00:00' },
    { people: { total: 10, locals: null, tourists: 7 } },
    { people: { total: -10, locals: 3, tourists: 7 } },
    { people: { total: 10, locals: 3, tourists: 8 } }
  ]) {
    assert.throws(() => validateRecord({ ...base, ...patch }, 'TEST-ONLY-AREA', now)); passed++;
  }
  assert.throws(() => validateRecord(base, '', now)); passed++;
  let requests = 0;
  const mock = async (url, options) => {
    requests++;
    assert.equal(url, DESTINATION);
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body);
    return { ok: true, text: async () => JSON.stringify({ ok: true, anchor: { total: body.people.total, observedAt: body.observedAt } }) };
  };
  assert.equal((await sendRecord(valid, 'test-only-secret-not-a-real-token', mock)).ok, true); passed++;
  await assert.rejects(sendRecord(valid, '', mock)); passed++;
  await assert.rejects(sendRecord(valid, 'test-only-secret-not-a-real-token', async () => ({ ok: false, status: 401 }))); passed++;
  assert.equal(requests, 1);
  console.log(JSON.stringify({ passed, networkRequests: 0, sentToProduction: false }));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) return selfTest();
  const fileArg = args.find(arg => !arg.startsWith('--'));
  if (!fileArg) throw new Error('provide the authorized export JSON path, or --self-test');
  const file = resolve(fileArg);
  const rel = relative(PROJECT_ROOT, file);
  if (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/'))) {
    throw new Error('keep the source export outside the web project directory');
  }
  const bytes = await readFile(file);
  if (bytes.length > MAX_FILE_BYTES) throw new Error('source file is too large');
  const payload = validateRecord(JSON.parse(bytes.toString('utf8')), process.env.JTO_APPROVED_SCOPE_ID);
  if (args.includes('--check')) {
    console.log(JSON.stringify({ valid: true, sentToProduction: false, sourceObservedAt: payload.observedAt }));
    return;
  }
  console.log(JSON.stringify(await sendRecord(payload, process.env.INGEST_TOKEN)));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(`Relay stopped: ${error.message}`); process.exitCode = 1; });
}
