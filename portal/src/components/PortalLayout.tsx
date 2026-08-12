import { NavLink, useNavigate } from 'react-router-dom';
import { getStoredTenant } from '../services/api';

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
    background: isActive ? '#ea580c' : 'transparent',
    color: isActive ? '#fff' : '#334155',
  };
}

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const tenant = getStoredTenant();

  const logout = () => {
    sessionStorage.removeItem('portalToken');
    sessionStorage.removeItem('portalTenant');
    navigate('/');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#fff7ed' }}>
      <header
        style={{
          background: '#fff',
          borderBottom: '1px solid #fed7aa',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <strong style={{ fontSize: 18, color: '#9a3412' }}>
            Totem Festival
          </strong>
          {tenant && (
            <div style={{ fontSize: 13, color: '#78716c' }}>{tenant.nome}</div>
          )}
        </div>
        <nav style={{ display: 'flex', gap: 8, flex: 1, flexWrap: 'wrap' }}>
          <NavLink to="/dashboard" style={navStyle}>
            Resumo
          </NavLink>
          <NavLink to="/produtos" style={navStyle}>
            Produtos
          </NavLink>
          <NavLink to="/vendas" style={navStyle}>
            Vendas
          </NavLink>
          <NavLink to="/totens" style={navStyle}>
            Totens
          </NavLink>
        </nav>
        <button
          onClick={logout}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid #fed7aa',
            background: '#fff',
            cursor: 'pointer',
            fontWeight: 600,
            color: '#9a3412',
          }}
        >
          Sair
        </button>
        {import.meta.env.VITE_PWA_URL ? (
          <a
            href={`${import.meta.env.VITE_PWA_URL}/operador/login`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              background: '#ea580c',
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            Modo Operador
          </a>
        ) : null}
      </header>
      <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
        {children}
      </main>
    </div>
  );
}
