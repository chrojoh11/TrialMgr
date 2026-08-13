// src/components/layout/sidebar.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Calendar,
  ChevronDown,
  ChevronRight,
  Plus,
  Users,
  Link2,
  Trophy,
  Clock,
  PlayCircle,
  FileText,
  ClipboardCheck,
  DollarSign,
  Info,
  BookOpen,
  Copy,
  Check,
  X,
} from 'lucide-react';
import { simpleTrialOperations } from '@/lib/trialOperationsSimple';
import { compareDateOnly } from '@/lib/dateOnly';
import {
  hasTrialPermission,
  isTrialCollaboratorRole,
  type EffectiveTrialRole,
  type TrialPermission,
} from '@/lib/trialPermissions';
import { useAuth } from '@/hooks/useAuth';

interface Trial {
  id: string;
  trial_name: string;
  start_date: string;
  end_date: string;
  trial_status: string;
  ownership?: 'owned';
  shared_role?: string;
}

interface SidebarProps {
  className?: string;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  className = '',
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const pathname = usePathname();
  const { user } = useAuth();
  const [trials, setTrials] = useState<Trial[]>([]);
  const [expandedTrials, setExpandedTrials] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const activeTrialId = pathname.match(/\/dashboard\/trials\/([^/]+)/)?.[1] || null;

  // Auto-expand trial if we're viewing one of its pages
  useEffect(() => {
    const trialIdMatch = pathname.match(/\/trials\/([^\/]+)/);
    if (trialIdMatch && trialIdMatch[1]) {
      const trialId = trialIdMatch[1];
      setExpandedTrials((prev) => new Set(prev).add(trialId));
    }
  }, [pathname]);

  const loadRecentTrials = useCallback(async () => {
    try {
      setLoading(true);
      const result = await simpleTrialOperations.getAllTrials();

      if (result.success && result.data) {
        // Sort by start_date (most recent first) and take 5 most recent
        const allTrials = [...result.data].sort((a: Trial, b: Trial) =>
          compareDateOnly(b.start_date, a.start_date)
        );
        const sorted = allTrials.slice(0, 5);

        // The open trial must remain visible even when it is older than the
        // five trials normally shown in the sidebar.
        if (activeTrialId && !sorted.some((trial: Trial) => trial.id === activeTrialId)) {
          const activeTrial = allTrials.find((trial: Trial) => trial.id === activeTrialId);
          if (activeTrial) sorted.splice(Math.min(4, sorted.length), 1, activeTrial);
        }

        setTrials(sorted);
      }
    } catch (error) {
      console.error('Error loading trials:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTrialId]);

  useEffect(() => {
    loadRecentTrials();
  }, [loadRecentTrials]);

  useEffect(() => {
    const refreshTrials = () => void loadRecentTrials();
    window.addEventListener('trial-access-changed', refreshTrials);
    return () => window.removeEventListener('trial-access-changed', refreshTrials);
  }, [loadRecentTrials]);

  const toggleTrial = (trialId: string) => {
    setExpandedTrials((prev) => {
      const newSet = new Set(prev);
      // The menu for the trial represented by the current URL stays open.
      if (trialId === activeTrialId) {
        newSet.add(trialId);
      } else if (newSet.has(trialId)) {
        newSet.delete(trialId);
      } else {
        newSet.add(trialId);
      }
      return newSet;
    });
  };

  const copyEntryLink = async (trialId: string) => {
    const baseUrl = window.location.origin;
    const entryLink = `${baseUrl}/entries/${trialId}`;

    try {
      await navigator.clipboard.writeText(entryLink);
      setCopiedLink(trialId);
      setTimeout(() => setCopiedLink(null), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  const isActivePage = (href: string): boolean => {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname === href;
  };

  const isTrialActive = (trialId: string): boolean => {
    return pathname.includes(`/trials/${trialId}`);
  };

  const effectiveRoleForTrial = (trial: Trial): EffectiveTrialRole => {
    if (user?.role === 'administrator') return 'administrator';
    if (trial.ownership === 'owned') return 'owner';
    if (isTrialCollaboratorRole(trial.shared_role)) return trial.shared_role;
    return 'legacy_secretary';
  };

  const trialMenuItems = (
    trial: Trial
  ): Array<{
    label: string;
    href?: string;
    icon: React.ComponentType<{ className?: string }>;
    onClick?: () => void;
    permission: TrialPermission;
  }> => [
    {
      label: 'Trial Details',
      href: `/dashboard/trials/${trial.id}`,
      icon: Info,
      permission: 'view_trial',
    },
    {
      label: 'Trial Application',
      href: `/dashboard/trials/${trial.id}/trial-application`,
      icon: ClipboardCheck,
      permission: 'generate_trial_application',
    },
    {
      label: 'Activity Journal',
      href: `/dashboard/trials/${trial.id}/journal`,
      icon: BookOpen,
      permission: 'view_trial',
    },
    {
      label: 'Trial Collaborators',
      href: `/dashboard/trials/${trial.id}/collaborators`,
      icon: Link2,
      permission: 'manage_collaborators',
    },
    {
      label: 'Entries',
      href: `/dashboard/trials/${trial.id}/entries`,
      icon: Users,
      permission: 'manage_entries',
    },
    {
      label: 'Copy Entry Link',
      onClick: () => copyEntryLink(trial.id),
      icon: Copy,
      permission: 'manage_entries',
    },

    {
      label: 'Close to Titles',
      href: `/dashboard/trials/${trial.id}/close-to-titles`,
      icon: Trophy,
      permission: 'generate_reports',
    },

    {
      label: 'Time Calculator',
      href: `/dashboard/trials/${trial.id}/time-calculator`,
      icon: Clock,
      permission: 'manage_financials',
    },
    {
      label: 'Running Order & Score Entry',
      href: `/dashboard/trials/${trial.id}/live-event`,
      icon: PlayCircle,
      permission: 'manage_running_order',
    },
    {
      label: 'Summary',
      href: `/dashboard/trials/${trial.id}/summary`,
      icon: FileText,
      permission: 'generate_reports',
    },
    {
      label: 'Financial Summary',
      href: `/dashboard/trials/${trial.id}/financials`,
      icon: DollarSign,
      permission: 'manage_financials',
    },
  ];

  return (
    <>
      {/* Mobile Overlay - only shows when menu is open on mobile */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar - slides in on mobile, always visible on desktop */}
      <nav
        className={`
          fixed lg:relative inset-y-0 left-0 z-50 lg:z-auto
          w-64 bg-[#fffdf7] border-r border-[#d9d8cf] overflow-y-auto
          transform transition-transform duration-300 ease-in-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${className}
        `}
      >
        <div className="p-4">
          {/* Mobile Close Button - only shows on mobile */}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="lg:hidden absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Close menu"
            >
              <X className="h-5 w-5 text-gray-600" />
            </button>
          )}

          {/* Dashboard Link */}
          <Link
            href="/dashboard"
            className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-2 ${
              isActivePage('/dashboard')
                ? 'border-l-4 border-[#b98935] bg-[#dfeadf] text-[#174733]'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Home className="h-5 w-5" />
            <span>Dashboard</span>
          </Link>

          {/* Trials Section */}
          <div className="mt-4">
            <div className="px-3 mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Trials
              </h3>
            </div>

            {loading ? (
              <div className="px-3 py-2 text-sm text-gray-500">Loading trials...</div>
            ) : (
              <div className="space-y-1">
                {trials.map((trial) => {
                  const isExpanded = trial.id === activeTrialId || expandedTrials.has(trial.id);
                  const isActive = isTrialActive(trial.id);

                  return (
                    <div key={trial.id}>
                      {/* Trial Name - Clickable to expand/collapse */}
                      <button
                        onClick={() => toggleTrial(trial.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-[#edf4ed] text-[#174733]'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <Calendar className="h-4 w-4" />
                          <span className="truncate">{trial.trial_name}</span>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 flex-shrink-0" />
                        )}
                      </button>

                      {/* Trial Submenu */}
                      {isExpanded && (
                        <div className="ml-4 mt-1 space-y-1 border-l-2 border-gray-200 pl-2">
                          {trialMenuItems(trial)
                            .filter((item) =>
                              hasTrialPermission(effectiveRoleForTrial(trial), item.permission)
                            )
                            .map((item) => {
                              const Icon = item.icon;

                              if (item.onClick) {
                                const isCopied = copiedLink === trial.id;
                                return (
                                  <button
                                    key={item.label}
                                    onClick={item.onClick}
                                    className="flex items-center space-x-2 px-3 py-1.5 rounded text-xs font-medium transition-colors w-full text-left text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                  >
                                    {isCopied ? (
                                      <Check className="h-4 w-4 flex-shrink-0 text-green-600" />
                                    ) : (
                                      <Icon className="h-4 w-4 flex-shrink-0" />
                                    )}
                                    <span className={isCopied ? 'text-green-600' : ''}>
                                      {isCopied ? 'Copied!' : item.label}
                                    </span>
                                  </button>
                                );
                              }

                              const isItemActive = isActivePage(item.href!);
                              return (
                                <Link
                                  key={item.label}
                                  href={item.href!}
                                  className={`flex items-center space-x-2 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                    isItemActive
                                      ? 'bg-[#dfeadf] text-[#174733]'
                                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                  }`}
                                >
                                  <Icon className="h-4 w-4 flex-shrink-0" />
                                  <span>{item.label}</span>
                                </Link>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Create New Trial Button */}
                <Link
                  href="/dashboard/trials/create"
                  className="mt-3 flex items-center space-x-2 rounded-lg border-2 border-dashed border-[#b9ceb9] px-3 py-2 text-sm font-medium text-[#225f45] transition-colors hover:border-[#225f45] hover:bg-[#edf4ed]"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create New Trial</span>
                </Link>
              </div>
            )}
          </div>

          {/* Trial Stats - Optional */}
          {trials.length > 0 && (
            <div className="mt-8 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Quick Stats
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Recent Trials</span>
                  <span className="font-medium">{trials.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Active Trials</span>
                  <span className="font-medium text-[#225f45]">
                    {trials.filter((t) => t.trial_status === 'active').length}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>
    </>
  );
};
