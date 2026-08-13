import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
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
    }),
  );
});

test('rejects a service-role key even for the dedicated SDDA project', () => {
  assert.throws(
    () => assertApprovedSupabaseEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: `https://${SDDA_SUPABASE_PROJECT_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: 'forbidden-value',
    }),
    /forbids SUPABASE_SERVICE_ROLE_KEY/,
  );
});

test('rejects credentials without an approved project URL', () => {
  assert.throws(
    () => assertApprovedSupabaseEnvironment({ SUPABASE_SERVICE_ROLE_KEY: 'configured' }),
    /forbids SUPABASE_SERVICE_ROLE_KEY/,
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

test('runtime code never reads the forbidden service-role variable', () => {
  const runtimeFiles = globSync('src/{app,components,hooks,lib}/**/*.{ts,tsx}');
  const offenders = runtimeFiles.filter((file) =>
    readFileSync(file, 'utf8').includes('process.env.SUPABASE_SERVICE_ROLE_KEY'),
  );
  assert.deepEqual(offenders, []);
});
