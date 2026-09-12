// Only a user-controlled, explicitly selected bootstrap proxy may execute scripts here.
// This is not a general URL proxy or a converter for VWorld's building data.
export const PROXY_ORIGIN = 'https://jeju-precision-proxy.onrender.com'; // planned, not deployed
const loopback = h => ['localhost', '127.0.0.1', '[::1]'].includes(h);
export function proxyBase(value, pageURL) {
  const page = new URL(pageURL), u = new URL(String(value).trim());
  const local = loopback(page.hostname) && loopback(u.hostname) && ['http:', 'https:'].includes(u.protocol);
  if (u.username || u.password || u.search || u.hash || u.pathname !== '/' || (!local && u.origin !== PROXY_ORIGIN)) {
    throw Error('허용된 본인 전용 프록시 주소만 사용할 수 있습니다. 주소 변경 시 허용 목록 검토가 필요합니다.');
  }
  return u.origin;
}
export function proxySDK(value, pageURL) {
  const u = new URL(value);
  if (u.pathname !== '/api/vworld/sdk.js' || u.search || u.hash) throw Error('허용되지 않은 SDK 경로입니다.');
  return proxyBase(u.origin, pageURL) + u.pathname;
}
export async function resolveProxy(value, pageURL, fetchImpl = globalThis.fetch, signal) {
  const base = proxyBase(value, pageURL);
  let response;
  try {
    response = await fetchImpl(base + '/api/vworld/config', {cache:'no-store', credentials:'omit', redirect:'error', signal});
  } catch { throw Error('프록시 응답을 받지 못했습니다. 배포 상태·CORS·등록 주소를 확인하세요.'); }
  if (!response.ok) throw Error('프록시 설정 확인 실패. 서버 상태를 확인하세요.');
  const text = await response.text();
  if (text.length > 4096) throw Error('프록시 응답 크기가 올바르지 않습니다.');
  let config;
  try { config = JSON.parse(text); } catch { throw Error('프록시 설정 응답이 JSON이 아닙니다.'); }
  if (config.provider !== 'VWorld WebGL 3.0' || config.transport !== 'sdk-bootstrap-proxy' || config.sdkPath !== '/api/vworld/sdk.js') {
    throw Error('지원되는 브이월드 프록시가 아닙니다.');
  }
  let registered;
  try { registered = new URL(config.serviceUrl); } catch { throw Error('프록시 등록 서비스 URL이 올바르지 않습니다.'); }
  const page = new URL(pageURL);
  const prefix = registered.pathname.endsWith('/') ? registered.pathname : registered.pathname + '/';
  if (registered.origin !== page.origin || !page.pathname.startsWith(prefix)) {
    throw Error('프록시에 설정된 브이월드 서비스 URL과 현재 사이트 주소가 다릅니다.');
  }
  if (config.keyConfigured !== true) throw Error('프록시 서버의 VWORLD_API_KEY가 아직 설정되지 않았습니다.');
  return {sdkSource:proxySDK(base + config.sdkPath, pageURL), transport:'sdk-bootstrap-proxy'};
}
