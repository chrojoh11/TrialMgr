const FORBIDDEN_SUPABASE_VARIABLES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
];

export function assertNoSupabaseEnvironment(environment = process.env) {
  const configured = FORBIDDEN_SUPABASE_VARIABLES.filter((name) => {
    const value = environment[name];
    return typeof value === 'string' && value.trim().length > 0;
  });

  if (configured.length > 0) {
    throw new Error(
      `SDDA TrialDesk blocks Supabase access. Remove these environment variables: ${configured.join(', ')}`,
    );
  }
}

assertNoSupabaseEnvironment();
