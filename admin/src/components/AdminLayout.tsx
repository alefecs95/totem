import { NavLink, useNavigate } from 'react-router-dom';

const linkBase: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  textDecoration: 'none',
  color: '#334155',
  fontWeight: 600,
  fontSize: 14,
};

function navStyle({ isActive }: { isActive: boolean }): React.CSSProperties {
  return {
    ...linkBase,
    background: isActive ? '#0f172a' : 'transparent',
    color: isActive ? '#fff' : '#334155',
  };
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();

  const logout = () => {
    sessionStorage.removeItem('adminToken');
    navigate('/');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <header
        style={{
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 24,
        }}
      >
        <strong style={{ fontSize: 18, color: '#0f172a' }}>
          Totem Festival · Admin
        </strong>
        <nav style={{ display: 'flex', gap: 8, flex: 1 }}>
          <NavLink to="/dashboard" style={navStyle}>
            Dashboard
          </NavLink>
          <NavLink to="/tenants" style={navStyle}>
            Organizadores
          </NavLink>
          <NavLink to="/transactions" style={navStyle}>
            Transações
          </NavLink>
        </nav>
        <button
          onClick={logout}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: '#fff',
            cursor: 'pointer',
            fontWeight: 600,
            color: '#334155',
          }}
        >
          Sair
        </button>
      </header>
      <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        {children}
      </main>
    </div>
  );
}
