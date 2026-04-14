import { Routes, Route, Navigate } from 'react-router-dom';

// Layouts
import AuthLayout from '../layouts/AuthLayout';
import AdminLayout from '../layouts/AdminLayout';

// Pages
import Login from '../pages/Login';
import Dashboard from '../pages/Dashboard';
import AiChat from '../pages/AiChat';
import DeviceModelManagement from '../pages/DeviceModelManagement';
import DeviceManagement from '../pages/DeviceManagement';
import PartnerManagement from '../pages/PartnerManagement';
import QuotaManagement from '../pages/QuotaManagement';
import SystemConfig from '../pages/SystemConfig';

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
        <Route path="/devices" element={<DeviceManagement />} />
        <Route path="/device-models" element={<DeviceModelManagement />} />
        <Route path="/partners" element={<PartnerManagement />} />
        <Route path="/quota" element={<QuotaManagement />} />
        <Route path="/settings" element={<SystemConfig />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
