import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimalsList } from './features/animals/AnimalsList';
import { AnimalDetail } from './features/animals/AnimalDetail';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/animals" replace />} />
      <Route path="/animals" element={<AnimalsList />} />
      <Route path="/animals/:id" element={<AnimalDetail />} />
    </Routes>
  );
}
