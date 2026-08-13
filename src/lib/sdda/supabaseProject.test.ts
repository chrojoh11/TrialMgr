import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSddaPublicSupabaseConfig,
  SDDA_SUPABASE_PROJECT_REF,
} from './supabaseProject';

test('returns the dedicated SDDA project configuration', () => {
  assert.deepEqual(
    getSddaPublicSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: `https://${SDDA_SUPABASE_PROJECT_REF}.supabase.co/`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'publishable-key',
    }),
    {
      url: `https://${SDDA_SUPABASE_PROJECT_REF}.supabase.co`,
      publishableKey: 'publishable-key',
    },
  );
});

test('rejects missing configuration and every other project', () => {
  assert.throws(() => getSddaPublicSupabaseConfig({}), /not configured/);
  assert.throws(
    () =>
      getSddaPublicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: 'https://legacy-cwags.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'legacy-key',
      }),
    /Blocked non-SDDA Supabase project/,
  );
});
