// src/app/page.tsx
'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Users, Trophy, Shield, Clock, MapPin } from 'lucide-react';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Redirect authenticated users to dashboard
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // 🔥 Do NOT redirect during recovery flow
    if (
      params.get('type') === 'recovery' ||
      params.has('access_token') ||
      params.has('token_hash')
    ) {
      return;
    }

    // Normal redirect for actual logged-in users
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-8 mx-auto mb-4 bg-orange-600 rounded-lg flex items-center justify-center text-white font-bold">
            SDDA
          </div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return null; // Will redirect to dashboard
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                SDDA
              </div>
              <h1 className="ml-3 text-xl font-bold">SDDA TrialDesk</h1>
            </div>
            <Link href="/login">
              <Button variant="secondary" className="bg-white text-orange-600 hover:bg-gray-50">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4">
            Professional Trial Management
          </Badge>
          <h2 className="text-4xl font-bold text-gray-900 mb-6">
            Run Your SDDA Trial With Confidence
          </h2>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Local-first secretary software for SDDA entries, running orders, scoring, official forms,
            finances, audit records, and trial reporting.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login">
              <Button size="lg" className="bg-orange-600 hover:bg-orange-700">
                Get Started
              </Button>
            </Link>
            <Button variant="outline" size="lg">
              Learn More
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <Calendar className="h-8 w-8 text-orange-600 mb-2" />
              <CardTitle>Trial Management</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Create and manage multi-day trials with dynamic class scheduling
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <Users className="h-8 w-8 text-orange-600 mb-2" />
              <CardTitle>Entry Processing</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Import Google Form or CSV responses with SDDA validation</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <Trophy className="h-8 w-8 text-orange-600 mb-2" />
              <CardTitle>Combined Scoring</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Running orders and score entry on the same page</p>
            </CardContent>
          </Card>
        </div>

        {/* CTA Section */}
        <div className="bg-white rounded-lg p-8 text-center shadow-sm border border-gray-200">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">Ready to Get Started?</h3>
          <p className="text-gray-600 mb-6">
            Prepare, operate, and report SDDA trials even when venue internet is unreliable.
          </p>
          <Link href="/login">
            <Button size="lg" className="bg-orange-600 hover:bg-orange-700">
              Sign In to Dashboard
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
