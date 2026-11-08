export function supabaseConfig(env = {}) {
  const url = env.VITE_SUPABASE_URL?.trim();
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url && !publishableKey) return null;
  const invalid = () => Object.assign(new Error('Set a valid HTTPS Supabase URL and publishable key. Never use a secret key in browser configuration.'), { code: 'supabase-config' });
  let parsed;
  try { parsed = new URL(url); } catch { throw invalid(); }
  if (parsed.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname)
    || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || parsed.pathname !== '/'
    || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey ?? '')) throw invalid();
  return { url: parsed.origin, publishableKey };
}
