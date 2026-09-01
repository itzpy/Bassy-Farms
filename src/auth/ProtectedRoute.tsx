import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { SignIn } from './SignIn';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) return <div className="app-shell"><p>Loading…</p></div>;
  if (!session) return <div className="app-shell"><SignIn /></div>;
  return <>{children}</>;
}
