import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { SignIn } from './SignIn';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) return <div className="auth-shell"><p>Loading…</p></div>;
  if (!session) return <div className="auth-shell"><div className="auth-card"><SignIn /></div></div>;
  return <>{children}</>;
}
