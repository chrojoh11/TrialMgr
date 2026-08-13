// src/components/layout/mainLayout.tsx
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Header } from './header';
import { Sidebar } from '@/components/layout/sidebar';
import { Breadcrumbs } from './breadcrumbs';
import { LoadingSpinner } from '@/components/ui/loadingSpinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface MainLayoutProps {
  children: React.ReactNode;
  title?: string;
  breadcrumbItems?: Array<{ label: string; href?: string }>;
  fullWidth?: boolean;
}

function MainLayout({ children, title, breadcrumbItems, fullWidth = false }: MainLayoutProps) {
  const { user, loading, error, isAuthenticated, signOut } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const router = useRouter();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show error state if there's an authentication error
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Authentication Error: {error}</AlertDescription>
          </Alert>
          <div className="mt-4 flex gap-3">
            <Button onClick={() => router.push('/login')} className="flex-1">
              Go to Login
            </Button>
            <Button onClick={() => window.location.reload()} variant="outline" className="flex-1">
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated || !user) {
    if (typeof window !== 'undefined') {
      window.location.pathname = '/login';
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // At this point, user is guaranteed to exist
  return (
    <div className="flex h-screen bg-[#f3f0e8] text-[#18231d]">
      {/* ✅ SIDEBAR - Responsive with mobile slide-out */}
      <Sidebar isMobileOpen={isMobileMenuOpen} onCloseMobile={() => setIsMobileMenuOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with hamburger menu for mobile */}
        <Header user={user} onMenuClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} />

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Breadcrumbs */}
          {breadcrumbItems && breadcrumbItems.length > 0 && (
            <div className="border-b border-[#d9d8cf] bg-[#fffdf7] px-4 py-3">
              <Breadcrumbs items={breadcrumbItems} />
            </div>
          )}

          {/* Page Header */}
          {title && (
            <div className="border-b border-[#d9d8cf] bg-[#fffdf7] px-4 py-4 lg:px-6">
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            </div>
          )}

          {/* Page Content - Conditional padding based on fullWidth prop */}
          <main className={`flex-1 overflow-y-auto ${fullWidth ? '' : 'p-4 lg:p-6'}`}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

export default MainLayout;
