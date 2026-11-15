// Guests need only anonymous transactional RPCs, not staff Auth, Storage or Realtime.
import { supabaseConfig } from './supabase-config.mjs';

const guestRpcs = new Set(['pos_setup_status', 'pos_get_menu', 'pos_guest_orders', 'pos_guest_submit', 'pos_guest_call', 'pos_guest_cancel']);
const unavailable = () => ({ data: null, error: { code: 'unavailable', message: 'unavailable' } });

export function createGuestClient(config, { fetchImpl = fetch } = {}) {
 return {
  async rpc(name, args = {}) {
   if (!guestRpcs.has(name)) return { data: null, error: { code: '42501', message: 'access-denied' } };
   try {
    const response = await fetchImpl(`${config.url}/rest/v1/rpc/${name}`, {
     method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
     headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
     body: JSON.stringify(args), signal: AbortSignal.timeout(15000),
    });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) return {
     data: null,
     error: { code: data?.code || 'unavailable', message: data?.message || 'unavailable', status: response.status },
    };
    return { data, error: null };
   } catch { return unavailable(); }
  },
 };
}

let client;
export function getGuestClient() {
 const config = supabaseConfig(import.meta.env ?? {});
 if (!config) return null;
 return client ??= createGuestClient(config);
}
