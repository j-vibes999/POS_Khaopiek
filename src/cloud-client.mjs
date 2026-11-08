import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from './supabase-config.mjs';

let client;
export function getCloudClient() {
  const config = supabaseConfig(import.meta.env ?? {});
  if (!config) return null;
  client ??= createClient(config.url, config.publishableKey, {
    global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.any([options.signal, AbortSignal.timeout(15000)].filter(Boolean)) }) },
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'khao-piek:auth:v1' },
  });
  return client;
}
