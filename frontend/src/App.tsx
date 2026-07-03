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
import Success from './pages/Success';
import Setup from './pages/Setup';

function RequireTotemConfig({ children }: { children: React.ReactNode }) {
  const location = useLocation();
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
          <Route path="/" element={<Home />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/payment" element={<Payment />} />
          <Route path="/pix" element={<PixQRCode />} />
          <Route path="/success" element={<Success />} />
        </Routes>
      </RequireTotemConfig>
    </BrowserRouter>
  );
}
