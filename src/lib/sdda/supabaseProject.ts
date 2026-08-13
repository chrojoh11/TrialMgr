export const SDDA_SUPABASE_PROJECT_REF = 'hsxwwtvzfulxdqimkgcc';
export const SDDA_SUPABASE_HOST = `${SDDA_SUPABASE_PROJECT_REF}.supabase.co`;

export interface SddaPublicSupabaseConfig {
  url: string;
  publishableKey: string;
}

export function getSddaPublicSupabaseConfig(
  environment: Record<string, string | undefined> = process.env,
): SddaPublicSupabaseConfig {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !publishableKey) {
    throw new Error('SDDA Supabase URL and publishable key are not configured.');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('SDDA Supabase URL is invalid.');
  }

  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== SDDA_SUPABASE_HOST) {
    throw new Error(`Blocked non-SDDA Supabase project: ${parsed.hostname || 'unknown'}.`);
  }

  return { url: parsed.origin, publishableKey };
}
