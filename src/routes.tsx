import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimalsList } from './features/animals/AnimalsList';
import { AnimalDetail } from './features/animals/AnimalDetail';
import { BatchesList } from './features/batches/BatchesList';
import { BatchDetail } from './features/batches/BatchDetail';
import { PlotsList } from './features/plots/PlotsList';
import { PlotDetail } from './features/plots/PlotDetail';
import { FarmEvents } from './features/farm/FarmEvents';
import { ProfitabilityDashboard } from './features/dashboard/ProfitabilityDashboard';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/animals" replace />} />
      <Route path="/animals" element={<AnimalsList />} />
      <Route path="/animals/:id" element={<AnimalDetail />} />
      <Route path="/batches" element={<BatchesList />} />
      <Route path="/batches/:id" element={<BatchDetail />} />
      <Route path="/plots" element={<PlotsList />} />
      <Route path="/plots/:id" element={<PlotDetail />} />
      <Route path="/farm" element={<FarmEvents />} />
      <Route path="/dashboard" element={<ProfitabilityDashboard />} />
    </Routes>
  );
}
