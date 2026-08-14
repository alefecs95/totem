import { NavLink, useNavigate } from 'react-router-dom';
import { getStoredTenant } from '../services/api';
import '../evento.css';

const links = [
  {
    to: '/evento/dashboard',
    label: 'Resumo',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/evento/produtos',
    label: 'Produtos',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 7h16v12H4V7Zm4-4h8l2 4H6l2-4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/evento/vendas',
    label: 'Vendas',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 12h16M4 12l4-4m-4 4 4 4M20 6v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/evento/totens',
    label: 'Totens',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="7" y="3" width="10" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/evento/operadores',
    label: 'Operadores',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="2" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
];

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
    navigate('/evento');
  };

  return (
    <div className="evento-shell">
      <aside className="evento-sidebar">
        <div className="evento-brand">
          <div className="evento-brand-kicker">Adm do evento</div>
          <div className="evento-brand-name">{tenant?.nome || 'Seu festival'}</div>
          {tenant?.email ? (
            <div className="evento-brand-mail">{tenant.email}</div>
          ) : null}
        </div>

        <nav className="evento-nav" aria-label="Painel do evento">
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="evento-side-actions">
          {import.meta.env.VITE_PWA_URL ? (
            <a
              className="btn btn-primary"
              href={`${import.meta.env.VITE_PWA_URL}/operador/login`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Modo operador
            </a>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={logout}>
            Sair
          </button>
        </div>
      </aside>
      <main className="evento-main">{children}</main>
    </div>
  );
}
