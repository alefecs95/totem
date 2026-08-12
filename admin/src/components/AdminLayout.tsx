import { NavLink, useNavigate } from 'react-router-dom';

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
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand-mark">TF</div>
          <h1>Totem Festival</h1>
          <p>Super admin</p>
        </div>

        <nav className="admin-nav">
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="admin-nav-ico">◆</span>
            Dashboard
          </NavLink>
          <NavLink to="/tenants" className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="admin-nav-ico">◎</span>
            Organizadores
          </NavLink>
          <NavLink
            to="/transactions"
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            <span className="admin-nav-ico">≡</span>
            Transações
          </NavLink>
        </nav>

        <div className="admin-sidebar-foot">
          <button type="button" className="btn btn-ghost" onClick={logout}>
            Sair do painel
          </button>
        </div>
      </aside>

      <main className="admin-main">{children}</main>
    </div>
  );
}
