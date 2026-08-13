import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Sales from './pages/Sales';
import Totens from './pages/Totens';
import Operadores from './pages/Operadores';
import PortalLayout from './components/PortalLayout';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = sessionStorage.getItem('portalToken');
  if (!token) return <Navigate to="/" replace />;
  return <PortalLayout>{children}</PortalLayout>;
}

export default function App() {
  return (
    <BrowserRouter>
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
          path="/produtos"
          element={
            <RequireAuth>
              <Products />
            </RequireAuth>
          }
        />
        <Route
          path="/vendas"
          element={
            <RequireAuth>
              <Sales />
            </RequireAuth>
          }
        />
        <Route
          path="/totens"
          element={
            <RequireAuth>
              <Totens />
            </RequireAuth>
          }
        />
        <Route
          path="/operadores"
          element={
            <RequireAuth>
              <Operadores />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
