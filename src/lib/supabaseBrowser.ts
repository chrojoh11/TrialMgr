// src/lib/supabaseBrowser.ts
import { createBrowserClient } from '@supabase/ssr';
import { getSddaPublicSupabaseConfig } from '@/lib/sdda/supabaseProject';

export function getSupabaseBrowser() {
  const { url, publishableKey } = getSddaPublicSupabaseConfig();
  return createBrowserClient(
    url,
    publishableKey,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    }
  );
}
