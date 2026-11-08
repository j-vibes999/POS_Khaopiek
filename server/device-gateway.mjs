// Trusted-computer bridge. The private device key is never sent to the browser.
import { assertWebpHeader, validateMenuImageTicket, MAX_MENU_UPLOAD_BYTES } from '../src/menu-upload.mjs';
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const loopbackAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const keyPattern = /^[0-9a-f]{64}$/;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function localRequest(req, mutation) {
  if (!loopbackAddresses.has(req.socket?.remoteAddress)) return false;
  let host;
  try { host = new URL(`http://${req.headers.host}`); } catch { return false; }
  if (!loopbackHosts.has(host.hostname) || host.username || host.password || host.pathname !== '/') return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = `${req.socket?.encrypted ? 'https' : 'http'}://${host.host}`;
  if (req.headers.origin && req.headers.origin !== origin) return false;
  return !mutation || (req.headers.origin === origin && req.headers['x-pos-device'] === '1');
}

function send(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.writeHead(status);
  res.end(JSON.stringify(body));
}
const failure = (res, status, code, message = code) => send(res, status, { data: null, error: { code, message } });

async function bytes(req, limit = 128000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) throw Object.assign(new Error('payload-too-large'), { status: 413 });
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}
async function body(req) {
  const data = await bytes(req);
  try { return JSON.parse(data.toString('utf8')); }
  catch { throw Object.assign(new Error('invalid-request'), { status: 400 }); }
}

export function createDeviceGateway({ supabaseUrl, publishableKey, deviceKey, fetchImpl = fetch } = {}) {
  const configured = Boolean(supabaseUrl && publishableKey && keyPattern.test(deviceKey ?? ''));
  async function uploadImage(req, res) {
    if (!/^image\/webp(?:;|$)/i.test(req.headers['content-type'] ?? '')) return failure(res, 400, 'P0001', 'image-type');
    let image;
    try { image = await bytes(req, MAX_MENU_UPLOAD_BYTES); assertWebpHeader(image.subarray(0, 16), image.length); }
    catch (error) { return failure(res, error.status || 400, 'P0001', error.status === 413 ? 'image-too-large' : 'image-type'); }
    try {
      const response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/pos_device_menu_upload_ticket`, {
        method: 'POST', headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_device_key: deviceKey }), signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) {
        const message = ['PGRST202', '42883', '42P01'].includes(data?.code) ? 'storage-not-ready'
          : data?.code === 'P0001' && /^[a-z][a-z0-9-]{1,60}$/.test(data?.message ?? '') ? data.message : 'upload-failed';
        return failure(res, response.status, 'P0001', message);
      }
      const ticket = validateMenuImageTicket(data);
      const uploaded = await fetchImpl(`${supabaseUrl}/storage/v1/object/${ticket.bucket}/${ticket.path}`, {
        method: 'POST', headers: { apikey: publishableKey, 'Content-Type': 'image/webp', 'x-upsert': 'false', 'cache-control': 'max-age=31536000' },
        body: image, signal: AbortSignal.timeout(30000),
      });
      if (!uploaded.ok) {
        const error = await uploaded.json().catch(() => ({}));
        const status = Number(error?.statusCode || uploaded.status);
        return failure(res, uploaded.status, 'P0001', status === 404 ? 'storage-not-ready' : status === 403 ? 'access-denied' : 'upload-failed');
      }
      return send(res, 200, { data: { url: `${supabaseUrl}/storage/v1/object/public/${ticket.bucket}/${ticket.path}` }, error: null });
    } catch { return failure(res, 503, 'P0001', 'upload-failed'); }
  }
  return async (req, res, next) => {
    // Automatic staff entry must not be embedded in a third-party page.
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    const path = req.url?.split('?')[0];
    if (!path?.startsWith('/api/device/')) return next();
    if (!localRequest(req, req.method !== 'GET')) return failure(res, 403, 'access-denied');
    if (path === '/api/device/status' && req.method === 'GET') return send(res, 200, { enabled: configured });
    if (path === '/api/device/menu-image' && req.method === 'POST') {
      if (!configured) return failure(res, 503, 'device-unavailable');
      return uploadImage(req, res);
    }
    if (path !== '/api/device/rpc' || req.method !== 'POST') return failure(res, 404, 'not-found');
    if (!configured) return failure(res, 503, 'device-unavailable');
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) return failure(res, 400, 'invalid-request');
    let input;
    try { input = await body(req); }
    catch (error) { return failure(res, error.status || 400, error.message); }
    if (!record(input) || typeof input.name !== 'string' || (input.args != null && !record(input.args))) return failure(res, 400, 'invalid-request');
    const args = input.args ?? {};
    let rpcName;
    let rpcArgs;
    switch (input.name) {
      case 'pos_setup_status': rpcName = 'pos_setup_status'; rpcArgs = {}; break;
      case 'pos_staff_snapshot': rpcName = 'pos_device_snapshot'; rpcArgs = { p_device_key: deviceKey }; break;
      case 'pos_claim_owner': rpcName = 'pos_device_setup'; rpcArgs = { p_device_key: deviceKey, p_shop_name: args.p_shop_name }; break;
      case 'pos_staff_command':
        if (typeof args.p_action !== 'string' || !record(args.p_payload)) return failure(res, 400, 'invalid-request');
        rpcName = 'pos_device_command'; rpcArgs = { p_device_key: deviceKey, p_action: args.p_action, p_payload: args.p_payload }; break;
      default: return failure(res, 400, 'unsupported-rpc');
    }
    try {
      const response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${rpcName}`, {
        method: 'POST', headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(rpcArgs), signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) {
        // PostgREST details/hints may contain SQL context; never forward them.
        const code = /^[A-Z0-9]{3,12}$/.test(data?.code ?? '') ? data.code : 'unavailable';
        const message = code === 'P0001' && /^[a-z][a-z0-9-]{1,60}$/.test(data?.message ?? '') ? data.message : 'device-unavailable';
        return failure(res, response.status, code, message);
      }
      return send(res, 200, { data, error: null });
    } catch { return failure(res, 503, 'device-unavailable'); }
  };
}
