import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertApprovedSupabaseEnvironment,
  SDDA_SUPABASE_PROJECT_REF,
} from './assert-no-supabase-env.js';

test('accepts an environment without Supabase credentials', () => {
  assert.doesNotThrow(() =>
    assertApprovedSupabaseEnvironment({ NEXTAUTH_SECRET: 'local-only' }),
  );
});

test('accepts only the dedicated SDDA Supabase project', () => {
  assert.doesNotThrow(() =>
    assertApprovedSupabaseEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: `https://${SDDA_SUPABASE_PROJECT_REF}.supabase.co`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'publishable-value',
      SUPABASE_SERVICE_ROLE_KEY: 'server-only-value',
    }),
  );
});

test('rejects credentials without an approved project URL', () => {
  assert.throws(
    () => assertApprovedSupabaseEnvironment({ SUPABASE_SERVICE_ROLE_KEY: 'configured' }),
    /requires NEXT_PUBLIC_SUPABASE_URL/,
  );
});

test('rejects every other Supabase project', () => {
  assert.throws(
    () =>
      assertApprovedSupabaseEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: 'https://cwags-project.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'configured',
      }),
    /blocks Supabase project cwags-project\.supabase\.co/,
  );
});
