import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import toast from 'react-hot-toast';
import { useEffect } from 'react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { connected, on } = useSocket();

  // Global toast notifications for real-time events
  useEffect(() => {
    const unsubStatus = on('order:status_updated', (data) => {
      toast.success(`Order #${data.orderId?.slice(-6)} → ${data.newStatus}`, { icon: '📦' });
    });
    const unsubLow = on('inventory:low_stock', (data) => {
      toast(`⚠️ Low stock: ${data.name} (${data.quantity} left)`, {
        style: { background: '#f59e0b', color: '#fff' },
      });
    });
    const unsubOut = on('inventory:out_of_stock', (data) => {
      toast.error(`🚨 OUT OF STOCK: ${data.name}`);
    });
    return () => { unsubStatus(); unsubLow(); unsubOut(); };
  }, [on]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const navItems = [
    { to: '/dashboard',  label: 'Dashboard',  icon: '📊' },
    { to: '/live-feed',  label: 'Live Feed',   icon: '⚡' },
    { to: '/orders',     label: 'Orders',      icon: '📦' },
    ...(user?.role !== 'buyer' ? [{ to: '/inventory', label: 'Inventory', icon: '🏪' }] : []),
  ];

  return (
    <div style={styles.shell}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <span style={styles.brandIcon}>⚡</span>
          <span style={styles.brandText}>TrackFlow</span>
        </div>

        <nav style={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({ ...styles.navLink, ...(isActive ? styles.navLinkActive : {}) })}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.wsStatus}>
            <span style={{ ...styles.wsDot, background: connected ? '#22c55e' : '#ef4444' }} />
            <span style={styles.wsLabel}>{connected ? 'Live' : 'Offline'}</span>
          </div>
          <div style={styles.userInfo}>
            <div style={styles.userAvatar}>{user?.name?.[0]?.toUpperCase()}</div>
            <div>
              <div style={styles.userName}>{user?.name}</div>
              <div style={styles.userRole}>{user?.role}</div>
            </div>
          </div>
          <button style={styles.logoutBtn} onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      {/* Main content */}
      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

const styles = {
  shell:        { display: 'flex', minHeight: '100vh', background: '#0f1117', color: '#e2e8f0', fontFamily: "'Inter', sans-serif" },
  sidebar:      { width: 240, background: '#1a1d27', display: 'flex', flexDirection: 'column', padding: '24px 0', position: 'fixed', height: '100vh', borderRight: '1px solid #2d3148' },
  brand:        { display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px 28px', borderBottom: '1px solid #2d3148', marginBottom: 16 },
  brandIcon:    { fontSize: 22 },
  brandText:    { fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px' },
  nav:          { flex: 1, padding: '0 12px' },
  navLink:      { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, color: '#94a3b8', textDecoration: 'none', fontSize: 14, fontWeight: 500, marginBottom: 4, transition: 'all 0.15s' },
  navLinkActive:{ background: '#6366f1', color: '#fff' },
  navIcon:      { fontSize: 16 },
  sidebarFooter:{ padding: '16px 16px 0', borderTop: '1px solid #2d3148', display: 'flex', flexDirection: 'column', gap: 12 },
  wsStatus:     { display: 'flex', alignItems: 'center', gap: 6 },
  wsDot:        { width: 8, height: 8, borderRadius: '50%' },
  wsLabel:      { fontSize: 12, color: '#94a3b8' },
  userInfo:     { display: 'flex', alignItems: 'center', gap: 10 },
  userAvatar:   { width: 34, height: 34, borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#fff', flexShrink: 0 },
  userName:     { fontSize: 13, fontWeight: 600, color: '#e2e8f0' },
  userRole:     { fontSize: 11, color: '#64748b', textTransform: 'capitalize' },
  logoutBtn:    { background: 'none', border: '1px solid #334155', color: '#94a3b8', padding: '7px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, textAlign: 'left' },
  main:         { flex: 1, marginLeft: 240, padding: 32, overflowY: 'auto' },
};
