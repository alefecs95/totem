import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';
import Login from './pages/Login';
import EventLogin from './pages/EventLogin';
import Dashboard from './pages/Dashboard';
import Tenants from './pages/Tenants';
import Transactions from './pages/Transactions';
import AdminLayout from './components/AdminLayout';
import PortalLayout from './eventPortal/components/PortalLayout';
import EventDashboard from './eventPortal/pages/Dashboard';
import EventProducts from './eventPortal/pages/Products';
import EventSales from './eventPortal/pages/Sales';
import EventTotens from './eventPortal/pages/Totens';
import EventOperadores from './eventPortal/pages/Operadores';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = sessionStorage.getItem('adminToken');
  if (!token) return <Navigate to="/" replace />;
  return <AdminLayout>{children}</AdminLayout>;
}

function RequireEventAuth({ children }: { children: React.ReactNode }) {
  const token = sessionStorage.getItem('portalToken');
  if (!token) return <Navigate to="/evento" replace />;
  return <PortalLayout>{children}</PortalLayout>;
}

const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/evento" element={<EventLogin />} />
        <Route
          path="/evento/dashboard"
          element={
            <RequireEventAuth>
              <EventDashboard />
            </RequireEventAuth>
          }
        />
        <Route
          path="/evento/produtos"
          element={
            <RequireEventAuth>
              <EventProducts />
            </RequireEventAuth>
          }
        />
        <Route
          path="/evento/vendas"
          element={
            <RequireEventAuth>
              <EventSales />
            </RequireEventAuth>
          }
        />
        <Route
          path="/evento/totens"
          element={
            <RequireEventAuth>
              <EventTotens />
            </RequireEventAuth>
          }
        />
        <Route
          path="/evento/operadores"
          element={
            <RequireEventAuth>
              <EventOperadores />
            </RequireEventAuth>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/tenants"
          element={
            <RequireAuth>
              <Tenants />
            </RequireAuth>
          }
        />
        <Route
          path="/transactions"
          element={
            <RequireAuth>
              <Transactions />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
