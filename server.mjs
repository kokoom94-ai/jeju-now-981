import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const INGEST_TOKEN = process.env.INGEST_TOKEN || '';
const DATA_MODE = (process.env.DATA_MODE || 'auto').toLowerCase();
const JTO_URL = process.env.JTO_SKT_API_URL || '';
const JTO_TOKEN = process.env.JTO_SKT_API_TOKEN || '';
const JTO_AUTH_HEADER = process.env.JTO_SKT_AUTH_HEADER || 'Authorization';
const JTO_AUTH_SCHEME = process.env.JTO_SKT_AUTH_SCHEME || 'Bearer';
const POLL_MS = Math.max(60_000, Number(process.env.JTO_SKT_POLL_MS || 300_000));
const MAX_AGE_MS = Math.max(POLL_MS * 2, Number(process.env.SKT_MAX_AGE_MS || 900_000));
const ALLOW_INSECURE_UPSTREAM = process.env.ALLOW_INSECURE_UPSTREAM === 'true';
const TOTAL_PATH = process.env.JTO_SKT_TOTAL_PATH || '';
const LOCALS_PATH = process.env.JTO_SKT_LOCALS_PATH || '';
const TOURISTS_PATH = process.env.JTO_SKT_TOURISTS_PATH || '';
const OBSERVED_AT_PATH = process.env.JTO_SKT_OBSERVED_AT_PATH || '';
// Opt-in adapter for a single, operator-approved public chart used by the JTO web UI.
// It deliberately does not discover datasets or bypass login/session controls.
const JTO_PUBLIC_CHART_REG_SN = process.env.JTO_PUBLIC_CHART_REG_SN || '';
const JTO_PUBLIC_CHART_INDEX = Number(process.env.JTO_PUBLIC_CHART_INDEX || 0);
const JTO_PUBLIC_CHART_VALUE_PATH = process.env.JTO_PUBLIC_CHART_VALUE_PATH || '';
const JTO_PUBLIC_CHART_LOCALS_PATH = process.env.JTO_PUBLIC_CHART_LOCALS_PATH || '';
const JTO_PUBLIC_CHART_TOURISTS_PATH = process.env.JTO_PUBLIC_CHART_TOURISTS_PATH || '';
const JTO_PUBLIC_CHART_OBSERVED_AT_PATH = process.env.JTO_PUBLIC_CHART_OBSERVED_AT_PATH || '';
const JTO_PUBLIC_CHART_URL = 'https://data.ijto.or.kr/api/dataPick/chart/renderChart.do';

const zones = [
  ['indoor-lobby', '실내 로비', 72, 140, 'indoor'],
  ['sports-lab', 'SPORTS LAB', 64, 120, 'indoor'],
  ['ringggo', 'RINGGGO', 36, 80, 'indoor'],
  ['space-cup', 'SPACE CUP', 44, 90, 'indoor'],
  ['ticket', '티켓존', 28, 80, 'indoor'],
  ['race-start', '레이스 출발', 66, 120, 'outdoor'],
  ['race-1', 'RACE 981 코스 1', 55, 100, 'outdoor'],
  ['race-2', 'RACE 981 코스 2', 52, 100, 'outdoor'],
  ['race-3', 'RACE 981 코스 3', 47, 100, 'outdoor'],
  ['return', '자동회차/리턴', 31, 90, 'outdoor'],
  ['outdoor', '야외광장', 45, 140, 'outdoor'],
  ['parking', '주차장', 84, 180, 'outdoor'],
  ['viewing', '관람존', 40, 100, 'outdoor']
].map(([id, name, base, capacity, area]) => ({ id, name, base, capacity, area }));

let sktAnchor = null;
let history = [];
let last = null;
let pollInFlight = false;
const provider = {
  configured: false, adapter: 'none', state: 'disabled', lastAttemptAt: null, lastSuccessAt: null,
  lastError: null, consecutiveFailures: 0
};

function koreanParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function timeFactor(date = new Date()) {
  const p = koreanParts(date);
  const hour = Number(p.hour) + Number(p.minute) / 60;
  const weekend = ['Sat', 'Sun'].includes(p.weekday) ? 1.16 : 1;
  const peak = .82 + .36 * Math.exp(-Math.pow((hour - 13.5) / 2.6, 2)) + .16 * Math.exp(-Math.pow((hour - 16) / 1.9, 2));
  return weekend * peak;
}

function crowdLabel(ratio) {
  if (ratio < .45) return ['쾌적', 'good'];
  if (ratio < .7) return ['보통', 'normal'];
  if (ratio < .9) return ['혼잡', 'busy'];
  return ['매우 혼잡', 'very-busy'];
}

function isFresh(anchor = sktAnchor) {
  return Boolean(anchor && Date.now() - anchor.receivedAt <= MAX_AGE_MS);
}

function currentAnchor() {
  return isFresh() ? sktAnchor : null;
}

function recommendation(now, baseline) {
  const choices = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(now.getTime() + (i + 1) * 15 * 60_000);
    return { date, predicted: baseline * (timeFactor(date) / timeFactor(now)) };
  });
  const best = choices.reduce((a, b) => a.predicted < b.predicted ? a : b);
  const p = koreanParts(best.date);
  return { label: `${p.hour}:${p.minute} 전후`, reason: '향후 3시간 중 혼잡 완화 예상', predictedTotal: Math.round(best.predicted) };
}

function allocateZones(target, now) {
  const weights = zones.map((zone, index) => zone.base * (1 + Math.sin(now.getTime() / 52_000 + index * 1.7) * .04));
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map(weight => target * weight / sum);
  const counts = exact.map(Math.floor);
  const remaining = Math.round(target - counts.reduce((a, b) => a + b, 0));
  exact.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction)
    .slice(0, remaining)
    .forEach(({ index }) => { counts[index] += 1; });
  return zones.map((zone, index) => {
    const count = counts[index];
    const ratio = count / zone.capacity;
    const [label, status] = crowdLabel(ratio);
    return {
      id: zone.id, name: zone.name, area: zone.area, count, capacity: zone.capacity,
      ratio: Number(ratio.toFixed(2)), label, status,
      waitMinutes: Math.max(0, Math.round((ratio - .35) * 32))
    };
  });
}

function generate() {
  const now = new Date();
  if (sktAnchor && !isFresh() && provider.state === 'live') provider.state = 'stale';
  const estimated = Math.round(zones.reduce((sum, zone) => sum + zone.base, 0) * timeFactor(now) *
    (1 + Math.sin(now.getTime() / 45_000) * .025 + Math.sin(now.getTime() / 110_000) * .018));
  const anchor = currentAnchor();
  const target = anchor ? anchor.total : estimated;
  const resultZones = allocateZones(target, now);
  const total = resultZones.reduce((sum, zone) => sum + zone.count, 0);
  const localsRatio = anchor?.locals != null && anchor.total > 0 ? anchor.locals / anchor.total :
    (anchor?.tourists != null && anchor.total > 0 ? 1 - anchor.tourists / anchor.total : .23);
  const locals = Math.round(total * localsRatio);
  const totalCapacity = zones.reduce((sum, zone) => sum + zone.capacity, 0);
  const [label, status] = crowdLabel(total / totalCapacity);
  const mode = anchor ? (anchor.source === 'JTO_PUBLIC_CHART_DERIVED' ? 'jto-derived' : 'skt-realtime') : 'estimated';
  last = {
    parkId: '981', observedAt: now.toISOString(), source: anchor?.source || 'ESTIMATED LIVE', mode,
    people: { total, locals, tourists: total - locals },
    crowd: { label, status }, zones: resultZones,
    recommendation: recommendation(now, total),
    dataStatus: {
      mode, providerState: provider.state, observedAt: anchor?.observedAt || null,
      ageSeconds: anchor ? Math.max(0, Math.floor((Date.now() - anchor.receivedAt) / 1000)) : null
    }
  };
  history.push(last);
  if (history.length > 180) history.shift();
  return last;
}

function valueAt(object, path) {
  return path.split('.').reduce((value, key) => value && typeof value === 'object' ? value[key] : undefined, object);
}

function firstValue(object, configuredPath, candidates) {
  if (configuredPath) return valueAt(object, configuredPath);
  for (const path of candidates) {
    const value = valueAt(object, path);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function toCount(value) {
  const number = typeof value === 'string' ? Number(value.replaceAll(',', '')) : Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function normalizeFeed(payload, options = {}) {
  const total = toCount(firstValue(payload, options.totalPath ?? TOTAL_PATH, options.totalCandidates ?? [
    'people.total', 'data.people.total', 'total', 'data.total', 'visitorCount', 'data.visitorCount', 'population', 'data.population'
  ]));
  if (total === null) throw new Error(options.errorHint || 'upstream response does not contain a valid total; set JTO_SKT_TOTAL_PATH');
  const locals = toCount(firstValue(payload, options.localsPath ?? LOCALS_PATH, options.localsCandidates ?? ['people.locals', 'data.people.locals', 'locals', 'data.locals', 'residentCount']));
  const tourists = toCount(firstValue(payload, options.touristsPath ?? TOURISTS_PATH, options.touristsCandidates ?? ['people.tourists', 'data.people.tourists', 'tourists', 'data.tourists', 'touristCount']));
  const rawObservedAt = firstValue(payload, options.observedAtPath ?? OBSERVED_AT_PATH, options.observedAtCandidates ?? ['observedAt', 'data.observedAt', 'timestamp', 'data.timestamp', 'updatedAt', 'data.updatedAt']);
  const observedAt = rawObservedAt ? new Date(rawObservedAt) : new Date();
  if (Number.isNaN(observedAt.getTime())) throw new Error('upstream observedAt is invalid');
  const age = Date.now() - observedAt.getTime();
  if (age > MAX_AGE_MS || age < -5 * 60_000) throw new Error('upstream observation is stale or has an invalid timestamp');
  return { source: options.source || 'JTO_SKT_REALTIME', observedAt: observedAt.toISOString(), total, locals, tourists };
}

function setAnchor(anchor) {
  sktAnchor = { ...anchor, receivedAt: Date.now() };
  provider.lastSuccessAt = new Date().toISOString();
  provider.lastError = null;
  provider.consecutiveFailures = 0;
  provider.state = 'live';
  generate();
}

function publicProviderStatus() {
  return {
    configured: provider.configured, adapter: provider.adapter, state: provider.state, lastAttemptAt: provider.lastAttemptAt,
    lastSuccessAt: provider.lastSuccessAt, lastError: provider.lastError,
    consecutiveFailures: provider.consecutiveFailures, pollEverySeconds: Math.round(POLL_MS / 1000),
    maxAgeSeconds: Math.round(MAX_AGE_MS / 1000), activeAnchor: isFresh(),
    anchorObservedAt: currentAnchor()?.observedAt || null
  };
}

async function pollJto() {
  if (!provider.configured || pollInFlight) return;
  pollInFlight = true;
  provider.lastAttemptAt = new Date().toISOString();
  try {
    const headers = { accept: 'application/json' };
    let requestUrl = JTO_URL;
    let requestOptions = { headers };
    if (provider.adapter === 'public-chart') {
      requestUrl = JTO_PUBLIC_CHART_URL;
      requestOptions = {
        method: 'POST',
        headers: {
          ...headers, 'content-type': 'application/json; charset=UTF-8',
          'x-requested-with': 'XMLHttpRequest', referer: 'https://data.ijto.or.kr/'
        },
        body: JSON.stringify({ regSn: JTO_PUBLIC_CHART_REG_SN, chartIndex: JTO_PUBLIC_CHART_INDEX, searchDataBgnDt: '', searchDataEndDt: '' })
      };
    } else if (JTO_TOKEN) {
      headers[JTO_AUTH_HEADER] = JTO_AUTH_SCHEME ? `${JTO_AUTH_SCHEME} ${JTO_TOKEN}` : JTO_TOKEN;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const response = await fetch(requestUrl, { ...requestOptions, signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`upstream responded ${response.status}`);
    const payload = await response.json();
    const anchor = provider.adapter === 'public-chart'
      ? normalizeFeed(payload, {
          totalPath: JTO_PUBLIC_CHART_VALUE_PATH, localsPath: JTO_PUBLIC_CHART_LOCALS_PATH,
          touristsPath: JTO_PUBLIC_CHART_TOURISTS_PATH, observedAtPath: JTO_PUBLIC_CHART_OBSERVED_AT_PATH,
          totalCandidates: [], localsCandidates: [], touristsCandidates: [], observedAtCandidates: [],
          source: 'JTO_PUBLIC_CHART_DERIVED',
          errorHint: 'approved JTO chart value is missing; set JTO_PUBLIC_CHART_VALUE_PATH'
        })
      : normalizeFeed(payload);
    setAnchor(anchor);
  } catch (error) {
    provider.consecutiveFailures += 1;
    provider.lastError = String(error.message || error).slice(0, 180);
    provider.state = 'degraded';
    generate();
  } finally {
    pollInFlight = false;
    const backoff = Math.min(POLL_MS * Math.pow(2, provider.consecutiveFailures), 30 * 60_000);
    setTimeout(pollJto, backoff);
  }
}

function configureProvider() {
  if (DATA_MODE === 'estimated') return;
  if (JTO_PUBLIC_CHART_REG_SN || JTO_PUBLIC_CHART_VALUE_PATH) {
    if (!/^\d{1,8}$/.test(JTO_PUBLIC_CHART_REG_SN) || !JTO_PUBLIC_CHART_VALUE_PATH) {
      provider.state = 'invalid-config';
      provider.lastError = 'public-chart adapter requires one approved numeric JTO_PUBLIC_CHART_REG_SN and JTO_PUBLIC_CHART_VALUE_PATH';
      return;
    }
    provider.configured = true;
    provider.adapter = 'public-chart';
    provider.state = 'connecting';
    pollJto();
    return;
  }
  if (!JTO_URL) { provider.state = 'not-configured'; return; }
  try {
    const url = new URL(JTO_URL);
    if (url.protocol !== 'https:' && !ALLOW_INSECURE_UPSTREAM) throw new Error('JTO_SKT_API_URL must use HTTPS');
    provider.configured = true;
    provider.adapter = 'approved-feed';
    provider.state = 'connecting';
    pollJto();
  } catch (error) {
    provider.state = 'invalid-config';
    provider.lastError = String(error.message || error);
  }
}

function sendJson(res, status, object) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(object));
}

async function bodyJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 64_000) throw new Error('request body too large');
  }
  return body ? JSON.parse(body) : {};
}

function authorized(req) {
  return Boolean(INGEST_TOKEN) && req.headers.authorization === `Bearer ${INGEST_TOKEN}`;
}

const clients = new Set();
function broadcast() {
  const payload = `data: ${JSON.stringify(last)}\n\n`;
  for (const response of clients) {
    try { response.write(payload); } catch { clients.delete(response); }
  }
}

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/health') return sendJson(res, 200, { ok: true, mode: last?.mode, source: last?.source, provider: publicProviderStatus() });
  if (url.pathname === '/api/v1/parks/981/live') return sendJson(res, 200, last);
  if (url.pathname === '/api/v1/parks/981/history') return sendJson(res, 200, history.slice(-60));
  if (url.pathname === '/api/v1/parks/981/skt/status') return sendJson(res, 200, publicProviderStatus());
  if (url.pathname === '/api/v1/parks/981/forecast') {
    const now = new Date();
    const base = last.people.total;
    const capacity = zones.reduce((sum, zone) => sum + zone.capacity, 0);
    const points = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now.getTime() + index * 30 * 60_000);
      const total = Math.round(base * timeFactor(date) / timeFactor(now));
      return { minutes: index * 30, total, label: crowdLabel(total / capacity)[0] };
    });
    return sendJson(res, 200, { observedAt: now.toISOString(), points });
  }
  if (url.pathname === '/api/v1/parks/981/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(last)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (url.pathname === '/api/v1/ingest/skt' && req.method === 'POST') {
    if (!INGEST_TOKEN) return sendJson(res, 503, { ok: false, error: 'ingest is disabled until INGEST_TOKEN is configured' });
    if (!authorized(req)) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
    try {
      const payload = await bodyJson(req);
      const people = payload.people || {};
      const total = toCount(people.total);
      if (total === null) return sendJson(res, 400, { ok: false, error: 'people.total must be a non-negative number' });
      const observedAt = payload.observedAt ? new Date(payload.observedAt) : new Date();
      if (Number.isNaN(observedAt.getTime()) || Date.now() - observedAt.getTime() > MAX_AGE_MS || observedAt.getTime() - Date.now() > 5 * 60_000) {
        return sendJson(res, 400, { ok: false, error: 'observedAt is stale or invalid' });
      }
      setAnchor({
        source: typeof payload.source === 'string' ? payload.source.slice(0, 80) : 'JTO_SKT_REALTIME',
        observedAt: observedAt.toISOString(), total, locals: toCount(people.locals), tourists: toCount(people.tourists)
      });
      return sendJson(res, 200, { ok: true, anchor: { ...sktAnchor, receivedAt: undefined } });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { ok: false, error: 'method not allowed' });
  const requestPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = resolve(ROOT, `.${requestPath}`);
  if (!filePath.startsWith(ROOT)) return sendJson(res, 403, { ok: false, error: 'forbidden' });
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': mime[extname(filePath)] || 'application/octet-stream', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' });
    if (req.method !== 'HEAD') res.end(data); else res.end();
  } catch { sendJson(res, 404, { ok: false, error: 'not found' }); }
});

generate();
configureProvider();
setInterval(() => { generate(); broadcast(); }, 5_000);
server.listen(PORT, '0.0.0.0', () => console.log(`JEJU NOW 9.81 running on ${PORT} (${provider.state})`));
