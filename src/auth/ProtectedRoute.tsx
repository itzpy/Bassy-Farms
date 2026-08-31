import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { SignIn } from './SignIn';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) return <p>Loading…</p>;
  if (!session) return <SignIn />;
  return <>{children}</>;
}
