'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import MainLayout from '@/components/layout/mainLayout';
import { PawLoader } from '@/components/ui/pawLoader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import {
  addSddaTrialTeamMember,
  getSddaTrialWorkspace,
  listSddaTrialTeam,
  removeSddaTrialTeamMember,
  type SddaTrialTeamMember,
} from '@/lib/sdda/trialRepository';

type TeamRole = 'secretary' | 'assistant' | 'viewer';

const roleDescription: Record<SddaTrialTeamMember['role'], string> = {
  owner: 'Full control, including team membership.',
  secretary: 'Trial setup, entries, scoring, finances, and operations.',
  assistant: 'Trial setup, entries, running orders, and scoring; no financial access.',
  viewer: 'Read-only access to the trial.',
};

export default function TrialTeamPage() {
  const trialId = useParams<{ trialId: string }>().trialId;
  const [trialName, setTrialName] = useState('Trial');
  const [members, setMembers] = useState<SddaTrialTeamMember[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('secretary');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const client = getSupabaseBrowser();
      const [trial, team] = await Promise.all([
        getSddaTrialWorkspace(client, trialId),
        listSddaTrialTeam(client, trialId),
      ]);
      setTrialName(trial.name);
      setMembers(team);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load the trial team.');
    } finally {
      setLoading(false);
    }
  }, [trialId]);

  useEffect(() => { void load(); }, [load]);

  const addMember = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    try {
      setWorking('add');
      setError(null);
      setMessage(null);
      await addSddaTrialTeamMember(getSupabaseBrowser(), trialId, email.trim(), role);
      setEmail('');
      setMessage('Trial team updated.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to add this team member.');
    } finally {
      setWorking(null);
    }
  };

  const removeMember = async (member: SddaTrialTeamMember) => {
    if (!window.confirm(`Remove ${member.display_name || member.email || 'this user'} from the trial team?`)) return;
    try {
      setWorking(member.user_id);
      setError(null);
      await removeSddaTrialTeamMember(getSupabaseBrowser(), trialId, member.user_id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to remove this team member.');
    } finally {
      setWorking(null);
    }
  };

  return <MainLayout breadcrumbItems={[{label:'Trials',href:'/dashboard/trials'},{label:trialName,href:`/dashboard/trials/${trialId}`},{label:'Trial team'}]}>
    <div className="mx-auto max-w-5xl space-y-5">
      <Card className="border-[#cbd9e5] bg-[#f8fafc]"><CardHeader><CardTitle className="flex items-center gap-2 font-serif text-3xl text-[#294f73]"><Users className="h-7 w-7"/>Trial team</CardTitle><CardDescription>Add registered TrialDesk users without configuring an email service. Every membership change is audited.</CardDescription></CardHeader></Card>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
      <Card><CardHeader><CardTitle>Add or change a team member</CardTitle><CardDescription>The person must register and confirm this exact email address before being added.</CardDescription></CardHeader><CardContent><form className="grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end" onSubmit={addMember}><div><Label htmlFor="team-email">Registered email</Label><Input id="team-email" type="email" className="mt-1 bg-white" value={email} onChange={(event)=>setEmail(event.target.value)} required/></div><div><Label htmlFor="team-role">Role</Label><select id="team-role" className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={role} onChange={(event)=>setRole(event.target.value as TeamRole)}><option value="secretary">Secretary</option><option value="assistant">Assistant</option><option value="viewer">Viewer</option></select></div><Button disabled={working==='add'}>{working==='add'?<PawLoader className="mr-2 h-4 w-4"/>:<UserPlus className="mr-2 h-4 w-4"/>}Add to trial</Button></form></CardContent></Card>
      <Card><CardHeader><CardTitle>People with access</CardTitle><CardDescription>Re-enter an existing member’s email above to change their role.</CardDescription></CardHeader><CardContent>{loading?<div className="flex justify-center py-12"><PawLoader className="h-8 w-8"/></div>:<div className="divide-y rounded-md border">{members.map((member)=><div key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex min-w-0 items-start gap-3"><ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-[#294f73]"/><div><p className="font-semibold">{member.display_name || member.email || 'TrialDesk user'}</p>{member.display_name && member.email && <p className="text-sm text-gray-600">{member.email}</p>}<p className="mt-1 text-xs text-gray-500">{roleDescription[member.role]}</p></div></div><div className="flex items-center gap-2"><Badge variant={member.is_owner?'default':'outline'}>{member.role}</Badge>{!member.is_owner&&<Button type="button" size="sm" variant="outline" disabled={working===member.user_id} onClick={()=>void removeMember(member)}>{working===member.user_id?<PawLoader className="h-4 w-4"/>:<Trash2 className="h-4 w-4"/>}<span className="sr-only">Remove member</span></Button>}</div></div>)}</div>}</CardContent></Card>
    </div>
  </MainLayout>;
}
