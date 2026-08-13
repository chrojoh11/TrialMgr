import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNoSupabaseEnvironment } from './assert-no-supabase-env.js';

test('accepts an environment without Supabase credentials', () => {
  assert.doesNotThrow(() => assertNoSupabaseEnvironment({ NEXTAUTH_SECRET: 'local-only' }));
});

test('rejects every former Supabase credential type', () => {
  for (const name of [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
  ]) {
    assert.throws(
      () => assertNoSupabaseEnvironment({ [name]: 'configured' }),
      new RegExp(name),
    );
  }
});
