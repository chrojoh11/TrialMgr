'use client';

import { PawPrint } from 'lucide-react';
import { cn } from '@/lib/utils';

type PawLoaderProps = {
  className?: string;
  label?: string;
};

export function PawLoader({ className, label = 'Processing' }: PawLoaderProps) {
  return (
    <span
      className={cn('paw-path-loader inline-flex items-center gap-0.5 text-[#2f6690]', className)}
      role="status"
      aria-label={label}
    >
      {[0, 1, 2, 3].map((step) => (
        <PawPrint
          key={step}
          className="paw-path-step h-3.5 w-3.5"
          style={{ animationDelay: `${step * 150}ms` }}
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">{label}</span>
    </span>
  );
}
