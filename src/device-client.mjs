// This transport reaches the trusted local gateway. It never receives the
// device's private credential, and it does not create a Supabase Auth session.
import { assertMenuImage } from './menu-upload.mjs';
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const fields = {
  pos_setup_status: [],
  pos_staff_snapshot: [],
  pos_claim_owner: ['p_shop_name'],
  pos_staff_command: ['p_action', 'p_payload'],
};
const failure = code => ({ data: null, error: { code, message: code } });
const deviceError = code => Object.assign(new Error(code), { code });

export function createDeviceClient({ fetchImpl = fetch } = {}) {
  return {
    accessMode: 'device',
    async uploadMenuImage(blob) {
      try { await assertMenuImage(blob); }
      catch (error) { return { data: null, error: { code: 'P0001', message: error.code || 'image-type' } }; }
      try {
        const response = await fetchImpl('/api/device/menu-image', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
          headers: { 'Content-Type': 'image/webp', 'X-POS-Device': '1' },
          body: blob, signal: AbortSignal.timeout(50000),
        });
        const result = await response.json();
        if (!result || typeof result !== 'object' || !Object.hasOwn(result, 'data') || !Object.hasOwn(result, 'error') || (!response.ok && !result.error)) return failure('upload-failed');
        return result;
      } catch { return failure('upload-failed'); }
    },
    async rpc(name, args = {}) {
      if (!Object.hasOwn(fields, name)) return failure('device-rpc-denied');
      const payload = Object.fromEntries(fields[name].filter(key => Object.hasOwn(args ?? {}, key)).map(key => [key, args[key]]));
      try {
        const response = await fetchImpl('/api/device/rpc', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
          headers: { 'Content-Type': 'application/json', 'X-POS-Device': '1' },
          body: JSON.stringify({ name, args: payload }), signal: AbortSignal.timeout(15000),
        });
        const result = await response.json();
        if (!result || typeof result !== 'object' || !Object.hasOwn(result, 'data') || !Object.hasOwn(result, 'error')) return failure('device-unavailable');
        if (!response.ok && !result.error) return failure('device-unavailable');
        return result;
      } catch { return failure('device-unavailable'); }
    },
  };
}

export async function probeDeviceAccess({ hostname = globalThis.location?.hostname, fetchImpl = fetch } = {}) {
  if (!loopbackHosts.has(hostname)) return null;
  let response;
  try {
    response = await fetchImpl('/api/device/status', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(7000) });
  } catch { throw deviceError('device-unavailable'); }
  if (response.status === 404 || response.status === 405) return null;
  if (response.status === 403) throw deviceError('device-denied');
  if (!response.ok) throw deviceError('device-unavailable');
  // A static preview without the optional gateway may return index.html here.
  if (!response.headers.get('content-type')?.includes('application/json')) return null;
  let status;
  try { status = await response.json(); } catch { throw deviceError('device-unavailable'); }
  return status?.enabled === true ? createDeviceClient({ fetchImpl }) : null;
}
