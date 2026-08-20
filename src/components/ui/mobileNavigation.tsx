//src/components/ui/mobileNavigation.tsx

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

interface MobileNavigationProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavigationItem {
  name: string;
  href: string;
  icon: any;
  roles: string[];
  badge?: string;
}

// ✅ FIXED: All URLs now have correct /dashboard/ prefix
const navigation: NavigationItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: Home,
    roles: ['administrator', 'trial_secretary'],
  },
  {
    name: 'Trials',
    href: '/dashboard/trials', // ✅ FIXED
    icon: Calendar,
    roles: ['administrator', 'trial_secretary'],
  },
];

export function MobileNavigation({ isOpen, onClose }: MobileNavigationProps) {
  const pathname = usePathname();
  const { user } = useAuth();

  // ✅ ADDED: Swipe-to-close functionality
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (touchStart - touchEnd > 150) {
      // Swiped left - close menu
      onClose();
    }
  };

  // Close on route change
  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Safety check AFTER all hooks
  if (!user) {
    return null; // Don't render mobile nav if no user
  }

  // Filter navigation items based on user role
  const filteredNavigation = navigation.filter(
    (item) => user && user.role && item.roles.includes(user.role)
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />

      {/* Slide-out menu with swipe support */}
      <div
        className="fixed top-0 left-0 bottom-0 w-64 sm:w-80 bg-white shadow-xl transform transition-transform"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-600 rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-[10px]">SDDA</span>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">SDDA TrialDesk</h2>
              <p className="text-xs text-gray-500">Secretary program</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="min-h-[44px] min-w-[44px]">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>
          <ul className="space-y-1">
            {filteredNavigation.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-colors min-h-[44px]',
                      isActive
                        ? 'bg-orange-50 text-orange-700 border-l-4 border-orange-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    )}
                    onClick={onClose}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    <span className="flex-1">{item.name}</span>
                    {item.badge && (
                      <span className="ml-auto px-2 py-1 text-xs bg-orange-500 text-white rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User info at bottom */}
        {user && (
          <div className="p-4 border-t bg-gray-50">
            <div className="text-sm">
              <p className="font-medium text-gray-900">
                {user.first_name} {user.last_name}
              </p>
              <p className="text-gray-600 capitalize text-xs sm:text-sm">
                {user.role?.replace('_', ' ')}
              </p>
              {user.club_name && <p className="text-gray-500 text-xs">{user.club_name}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
