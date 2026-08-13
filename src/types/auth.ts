// src/types/auth.ts
export interface User {
  id: string;
  email: string;
  display_name: string;
  first_name: string;
  last_name: string;
  role: 'administrator' | 'trial_secretary';
  club_name: string | null;
  phone: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
}

export interface AuthContextType extends AuthState {
  signOut: () => void;
  getFullName: () => string;
  getDisplayInfo: () => {
    fullName: string;
    role: string;
    clubName: string;
    email: string;
    isActive: boolean;
  } | null;
}
