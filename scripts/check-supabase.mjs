import { fileURLToPath, pathToFileURL } from 'node:url';
import { supabaseConfig } from '../src/supabase-config.mjs';

export async function checkSupabaseConnection(config, { fetchImpl = fetch } = {}) {
  const result = (connected, schemaReady, code) => ({ connected, schemaReady, code });
  if (!config) return result(false, false, 'not-configured');
  const headers = { apikey: config.publishableKey, 'Content-Type': 'application/json' };
  try {
    const auth = await fetchImpl(`${config.url}/auth/v1/settings`, { headers, signal: AbortSignal.timeout(10000) });
    if ([401, 403].includes(auth.status)) return result(false, false, 'access-denied');
    if (!auth.ok) return result(false, false, 'unavailable');
    // This read-only RPC verifies the Data API without its secret-key-only OpenAPI index.
    const schema = await fetchImpl(`${config.url}/rest/v1/rpc/pos_setup_status`, {
      method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(10000),
    });
    if (schema.status === 404) return result(true, false, 'schema-missing');
    if ([401, 403].includes(schema.status)) return result(true, false, 'access-denied');
    if (!schema.ok) return result(true, false, 'unavailable');
    const data = await schema.json();
    if (data?.schemaVersion === 1) return result(true, false, 'workflow-missing');
    if (data?.schemaVersion === 2 && data.guestOrdersReady === true && data.paymentsReady === true && data.integrityReady !== true) return result(true, false, 'integrity-missing');
    return data?.schemaVersion === 2 && data.guestOrdersReady === true && data.paymentsReady === true ? result(true, true, 'ready') : result(true, false, 'schema-version');
  } catch { return result(false, false, 'unavailable'); }
}

async function main() {
  try {
    try { process.loadEnvFile(fileURLToPath(new URL('../.env.local', import.meta.url))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const status = await checkSupabaseConnection(supabaseConfig(process.env));
    const messages = {
      ready: 'Supabase connection and transactional POS endpoints are ready.',
      'schema-missing': 'Supabase connection works. Run supabase/setup.sql in the project SQL Editor, then run this check again.',
      'schema-version': 'Supabase connection works, but the POS schema version does not match this app.',
      'workflow-missing': 'Supabase foundation exists. Run supabase/upgrade.sql to enable real ordering, payments and owner setup.',
      'integrity-missing': 'Supabase connects, but the menu integrity update is missing. Run supabase/upgrade.sql, or supabase/integrity-upgrade.sql if migrations 1–5 are already installed.',
      'access-denied': 'Supabase access was denied. Check the project URL, publishable key, and RPC grants.',
      unavailable: 'Supabase could not be reached or returned an unexpected response. Try this check again.',
      'not-configured': 'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local first.',
    };
    console.log(messages[status.code]);
    process.exitCode = status.schemaReady ? 0 : status.connected ? 2 : 1;
  } catch {
    console.error('Invalid local Supabase configuration. Use the project URL and publishable key from .env.example.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
