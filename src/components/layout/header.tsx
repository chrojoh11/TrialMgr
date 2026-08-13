'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { User } from '@/types/auth';
import { Button } from '@/components/ui/button';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';

import { Badge } from '@/components/ui/badge';

interface HeaderProps {
  user: User;
  onMenuClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, onMenuClick }) => {
  const { signOut } = useAuth();

  // ✅ Clock state that updates every second
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleString());

  // ✅ Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleString());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  if (!user) {
    return (
      <header className="bg-white shadow-sm border-b border-gray-200 z-30">
        <div className="flex items-center justify-between h-16 px-4 lg:px-6">
          <div>Loading...</div>
        </div>
      </header>
    );
  }

  const handleLogout = () => {
    signOut();
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'administrator':
        return 'bg-red-100 text-red-800';
      case 'trial_secretary':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatRoleName = (role: string) => {
    return role.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 z-30">
      <div className="flex items-center justify-between h-14 sm:h-16 px-2 sm:px-4 lg:px-6">
        {/* Left Section */}
        <div className="flex items-center space-x-2 sm:space-x-4">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden p-2 min-h-[44px] min-w-[44px]"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* SDDA identity */}
          <Link href="/dashboard" className="flex items-center space-x-2 sm:space-x-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-600 text-sm font-bold text-white sm:h-12 sm:w-12">
              SDDA
            </div>

            <div className="hidden sm:block">
              <h1 className="text-lg sm:text-xl font-bold text-gray-900">SDDA TrialDesk</h1>
              <p className="text-xs text-gray-500 -mt-1">Secretary workspace</p>
            </div>
          </Link>
        </div>

        {/* Center Section - Clock - Hidden on mobile */}
        <div className="hidden md:flex items-center justify-center">
          <div className="text-sm font-medium text-gray-700">{currentTime}</div>
        </div>

        {/* Right Section - User Menu */}
        <div className="flex items-center space-x-2 sm:space-x-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center space-x-2 min-h-[44px] p-2">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-orange-600 flex items-center justify-center text-white font-semibold">
                  {user.first_name[0]}
                  {user.last_name[0]}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium text-gray-900">
                    {user.first_name} {user.last_name}
                  </p>
                  <p className="text-xs text-gray-500">{formatRoleName(user.role)}</p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-white">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">
                    {user.first_name} {user.last_name}
                  </p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                  <p className="text-xs text-gray-500">{formatRoleName(user.role)}</p>
                  {user.club_name && <p className="text-xs text-gray-500">{user.club_name}</p>}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-red-600 focus:text-red-700 focus:bg-red-50"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};
