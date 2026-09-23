import { useEffect } from 'react';
import { BrowserRouter, NavLink } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppRoutes } from './routes';
import { startSyncLoop } from './lib/sync';
import { UnsyncedIndicator } from './components/UnsyncedIndicator';
import { VaccinationReminders } from './features/reminders/VaccinationReminders';
import { AnimalsIcon, BatchesIcon, PlotsIcon, FarmIcon, DashboardIcon } from './components/NavIcons';

const NAV_ITEMS = [
  { to: '/animals', label: 'Animals', Icon: AnimalsIcon },
  { to: '/batches', label: 'Batches', Icon: BatchesIcon },
  { to: '/plots', label: 'Plots', Icon: PlotsIcon },
  { to: '/farm', label: 'Farm', Icon: FarmIcon },
  { to: '/dashboard', label: 'Dashboard', Icon: DashboardIcon },
] as const;

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
            <VaccinationReminders />
            <AppRoutes />
          </div>
          <nav className="primary-nav" aria-label="Primary">
            <ul className="primary-nav-list">
              {NAV_ITEMS.map(({ to, label, Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
                  >
                    <Icon className="nav-icon" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </ProtectedRoute>
      </BrowserRouter>
    </AuthProvider>
  );
}
