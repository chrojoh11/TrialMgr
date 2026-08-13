export const SDDA_SUPABASE_PROJECT_REF = 'hsxwwtvzfulxdqimkgcc';
const SDDA_SUPABASE_HOST = `${SDDA_SUPABASE_PROJECT_REF}.supabase.co`;

const SUPABASE_VARIABLES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
];

export function assertApprovedSupabaseEnvironment(environment = process.env) {
  const configured = SUPABASE_VARIABLES.filter((name) => {
    const value = environment[name];
    return typeof value === 'string' && value.trim().length > 0;
  });

  if (configured.length === 0) return;

  const configuredUrl = environment.NEXT_PUBLIC_SUPABASE_URL ?? environment.SUPABASE_URL;
  if (!configuredUrl) {
    throw new Error(
      'SDDA TrialDesk requires NEXT_PUBLIC_SUPABASE_URL when Supabase credentials are configured.',
    );
  }

  let hostname;
  try {
    hostname = new URL(configuredUrl).hostname.toLowerCase();
  } catch {
    throw new Error('SDDA TrialDesk received an invalid Supabase URL.');
  }

  if (hostname !== SDDA_SUPABASE_HOST) {
    throw new Error(
      `SDDA TrialDesk blocks Supabase project ${hostname}. Expected project ${SDDA_SUPABASE_PROJECT_REF}.`,
    );
  }
}

assertApprovedSupabaseEnvironment();
