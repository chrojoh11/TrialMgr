// src/lib/supabaseServer.ts
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getSddaPublicSupabaseConfig } from '@/lib/sdda/supabaseProject';

export async function getSupabaseServer() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSddaPublicSupabaseConfig();

  return createServerClient(
    url,
    publishableKey,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );
}
