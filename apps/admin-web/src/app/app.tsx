import { Routes, Route, Navigate } from 'react-router-dom';

// Layouts
import AuthLayout from '../layouts/AuthLayout';
import AdminLayout from '../layouts/AdminLayout';

// Pages
import Login from '../pages/Login';
import Dashboard from '../pages/Dashboard';
import AiChat from '../pages/AiChat';
import Placeholder from '../pages/Placeholder';

export function App() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
      </Route>

      <Route element={<AdminLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/ai-chat" element={<AiChat />} />
        <Route path="/devices" element={<Placeholder title="Device Management" />} />
        <Route path="/device-models" element={<Placeholder title="Device Models" />} />
        <Route path="/partners" element={<Placeholder title="Partner Management" />} />
        <Route path="/quota" element={<Placeholder title="Quota Usage" />} />
        <Route path="/settings" element={<Placeholder title="System Settings" />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
