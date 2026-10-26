'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';

export interface JudgeOption {
  sdda_contact_id: number;
  display_name: string;
  source_checked_on: string;
}

interface JudgeSelectProps {
  id: string;
  value: string;
  judges: JudgeOption[];
  placeholder?: string;
  onChange: (value: string) => void;
}

export function JudgeSelect({ id, value, judges, placeholder, onChange }: JudgeSelectProps) {
  const listId = `${id}-active-sdda-judges`;
  return (
    <div className="space-y-1">
      <Input
        id={id}
        list={listId}
        className="bg-white"
        placeholder={placeholder || 'Search current SDDA judges'}
        value={value}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {judges.map((judge) => (
          <option key={judge.sdda_contact_id} value={judge.display_name}>
            SDDA contact {judge.sdda_contact_id}
          </option>
        ))}
      </datalist>
      <p className="text-xs text-gray-600">
        Choose from the current directory, or type a pending substitution.{' '}
        <Link
          href="https://www.sdda.ca/sporting-detection-dogs-association-judges/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-[#294f73] underline"
        >
          Check SDDA list <ExternalLink className="h-3 w-3" />
        </Link>
      </p>
    </div>
  );
}

