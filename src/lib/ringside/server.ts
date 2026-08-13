import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { getServiceRoleClient } from '@/lib/apiAuth';
import type {
  RingsideBlock,
  RingsideEntry,
  RingsideRing,
  RingsideShow,
  RingsideState,
} from './types';
const cookieName = (ringId: string) => `ringside_secretary_${ringId}`;
const secret = () => {
  const value = process.env.RINGSIDE_SESSION_SECRET;
  if (!value) throw new Error('RINGSIDE_SESSION_SECRET is required for ringside sessions.');
  return value;
};
const sign = (value: string) =>
  crypto.createHmac('sha256', secret()).update(value).digest('base64url');
export async function createSecretarySession(showId: string, ringId: string, version: number) {
  const payload = Buffer.from(
    JSON.stringify({ showId, ringId, version, exp: Date.now() + 16 * 60 * 60 * 1000 })
  ).toString('base64url');
  (await cookies()).set(cookieName(ringId), `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 16 * 60 * 60,
  });
}
export async function clearSecretarySession(ringId: string) {
  (await cookies()).delete(cookieName(ringId));
}
export async function readSecretarySession(ringId: string) {
  const raw = (await cookies()).get(cookieName(ringId))?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split('.');
  const expected = payload ? sign(payload) : '';
  if (
    !payload ||
    !sig ||
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
    return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    const db = getServiceRoleClient();
    const { data: ring } = await db
      .from('ringside_rings')
      .select('id,show_id,session_version')
      .eq('id', data.ringId)
      .maybeSingle();
    return ring &&
      ring.id === ringId &&
      ring.show_id === data.showId &&
      ring.session_version === data.version
      ? data
      : null;
  } catch {
    return null;
  }
}
export const hashPin = (pin: string) => bcrypt.hash(pin, 12);
export const verifyPin = (pin: string, hash: string) => bcrypt.compare(pin, hash);
export function publicStateQuery(showNumber: string) {
  return getServiceRoleClient()
    .from('ringside_shows')
    .select(
      '*,ringside_rings(*,ringside_blocks!ringside_blocks_ring_id_fkey(*,ringside_entries(*)))'
    )
    .eq('public_show_number', showNumber)
    .maybeSingle();
}
type NestedState = RingsideShow & {
  ringside_rings: Array<
    RingsideRing & {
      ringside_blocks: Array<RingsideBlock & { ringside_entries: RingsideEntry[] }>;
    }
  >;
};
export function flattenState(data: NestedState): RingsideState {
  const rings = (data.ringside_rings || []).sort((a, b) => a.display_order - b.display_order);
  const blocks = rings
    .flatMap((r) => r.ringside_blocks || [])
    .sort((a, b) => a.sequence - b.sequence);
  const entries = blocks.flatMap((b) => b.ringside_entries || []);
  return {
    show: {
      id: data.id,
      trial_id: data.trial_id,
      public_show_number: data.public_show_number,
      title: data.title,
      show_date: data.show_date,
      venue: data.venue,
      status: data.status,
    },
    rings,
    blocks,
    entries,
  };
}
