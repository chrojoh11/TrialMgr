import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getSupabaseServer } from '@/lib/supabaseServer';

export type AppRole = 'administrator' | 'trial_secretary';

export interface AuthorizedUser {
  user: User;
  role: AppRole;
}

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 = 401
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export function getSupabaseAdmin(): SupabaseClient {
  throw new Error(
    'Legacy administrator database access is disabled in SDDA TrialDesk. Use the signed-in user and RLS.'
  );
}

export async function requireAuthenticatedUser(): Promise<AuthorizedUser> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new AuthorizationError('Authentication required.', 401);
  }

  const admin = getSupabaseAdmin();
  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('role, is_active')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || profile.is_active === false) {
    throw new AuthorizationError('Active user profile required.', 403);
  }

  if (profile.role !== 'administrator' && profile.role !== 'trial_secretary') {
    throw new AuthorizationError('User role is not authorized.', 403);
  }

  return { user, role: profile.role };
}

export async function requireAdministrator(): Promise<AuthorizedUser> {
  const authorized = await requireAuthenticatedUser();
  if (authorized.role !== 'administrator') {
    throw new AuthorizationError('Administrator access required.', 403);
  }
  return authorized;
}

export async function requireTrialAccess(trialId: string): Promise<AuthorizedUser> {
  const authorized = await requireAuthenticatedUser();
  if (authorized.role === 'administrator') return authorized;

  const admin = getSupabaseAdmin();
  const [{ data: trial, error: trialError }, { data: assignment, error: assignmentError }] =
    await Promise.all([
      admin.from('trials').select('created_by').eq('id', trialId).maybeSingle(),
      admin
        .from('trial_assignments')
        .select('id')
        .eq('trial_id', trialId)
        .eq('user_id', authorized.user.id)
        .maybeSingle(),
    ]);

  if (trialError || assignmentError) {
    throw new Error('Unable to verify trial access.');
  }

  if (!trial) {
    throw new AuthorizationError('Trial not found or inaccessible.', 403);
  }

  if (trial.created_by !== authorized.user.id && !assignment) {
    throw new AuthorizationError('You are not assigned to this trial.', 403);
  }

  return authorized;
}
