import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Tenants from './pages/Tenants';
import Transactions from './pages/Transactions';
import AdminLayout from './components/AdminLayout';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = sessionStorage.getItem('adminToken');
  if (!token) return <Navigate to="/" replace />;
  return <AdminLayout>{children}</AdminLayout>;
}

// Remove a barra final do BASE_URL para usar como basename do router.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<Login />} />
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
