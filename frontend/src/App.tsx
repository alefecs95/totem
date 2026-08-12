import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import Home from './pages/Home';
import Cart from './pages/Cart';
import Payment from './pages/Payment';
import PixQRCode from './pages/PixQRCode';
import CardWaiting from './pages/CardWaiting';
import Success from './pages/Success';
import Setup from './pages/Setup';
import OperatorLogin from './pages/operador/OperatorLogin';
import Operator from './pages/operador/Operator';

function RequireTotemConfig({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (location.pathname.startsWith('/operador')) {
    return <>{children}</>;
  }
  if (location.pathname === '/setup') return <>{children}</>;

  const tenantId = localStorage.getItem('tenantId');
  const totemId = localStorage.getItem('totemId');
  if (!tenantId || !totemId) {
    return <Navigate to="/setup" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <RequireTotemConfig>
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/operador/login" element={<OperatorLogin />} />
          <Route path="/operador" element={<Operator />} />
          <Route path="/" element={<Home />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/payment" element={<Payment />} />
          <Route path="/pix" element={<PixQRCode />} />
          <Route path="/card" element={<CardWaiting />} />
          <Route path="/success" element={<Success />} />
        </Routes>
      </RequireTotemConfig>
    </BrowserRouter>
  );
}
