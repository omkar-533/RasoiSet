import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import LegalNotice from './pages/LegalNotice';
import Login from './pages/Login';
import { useStore } from './store/useStore';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Tables from './pages/Tables';
import KOT from './pages/KOT';
import KDS from './pages/KDS';
import Menu from './pages/Menu';
import Inventory from './pages/Inventory';
import Vendors from './pages/Vendors';
import Customers from './pages/Customers';
import OnlineOrders from './pages/OnlineOrders';
import Orders from './pages/Orders';
import Reports from './pages/Reports';
import Staff from './pages/Staff';
import SettingsPage from './pages/Settings';
import Integrations from './pages/Integrations';

export default function App() {
  const hydrated = useStore((s) => s.hydrated);
  const session = useStore((s) => s.session);
  if (!hydrated) {
    return <div className="flex min-h-screen items-center justify-center bg-app text-sm text-slate-500">Loading RasoiSet…</div>;
  }
  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/privacy" element={<LegalNotice topic="privacy" />} />
      <Route path="/terms" element={<LegalNotice topic="terms" />} />
      {session ? (
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/tables" element={<Tables />} />
          <Route path="/kot" element={<KOT />} />
          <Route path="/kds" element={<KDS />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/vendors" element={<Vendors />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/online" element={<OnlineOrders />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/settings/integrations" element={<Integrations />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/staff" element={<Staff />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      ) : (
        <>
          <Route path="/" element={<Landing />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  );
}
