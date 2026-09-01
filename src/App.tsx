import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppRoutes } from './routes';
import { startSyncLoop } from './lib/sync';
import { UnsyncedIndicator } from './components/UnsyncedIndicator';

function SyncManager() {
  const { session } = useAuth();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    const stop = startSyncLoop();
    return stop;
    // Keyed on user id (not the session object) so a token refresh — which produces a
    // new session reference with the same user — doesn't tear down and restart the loop.
  }, [userId]);

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <SyncManager />
        <ProtectedRoute>
          <div className="app-shell">
            <UnsyncedIndicator />
            <AppRoutes />
          </div>
        </ProtectedRoute>
      </BrowserRouter>
    </AuthProvider>
  );
}
