import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppRoutes } from './routes';
import { startSyncLoop } from './lib/sync';

export default function App() {
  useEffect(() => {
    const stop = startSyncLoop();
    return stop;
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <ProtectedRoute>
          <AppRoutes />
        </ProtectedRoute>
      </BrowserRouter>
    </AuthProvider>
  );
}
