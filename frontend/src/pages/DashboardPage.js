import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ordersAPI, inventoryAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { formatDistanceToNow } from 'date-fns';

const STATUS_COLOR = {
  PLACED:           '#6366f1',
  CONFIRMED:        '#3b82f6',
  PACKED:           '#8b5cf6',
  SHIPPED:          '#f59e0b',
  OUT_FOR_DELIVERY: '#f97316',
  DELIVERED:        '#22c55e',
  CANCELLED:        '#ef4444',
  RETURNED:         '#64748b',
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { connected, events } = useSocket();
  const [orders, setOrders]       = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([
      ordersAPI.getAll({ limit: 5 }),
      user.role !== 'buyer' ? inventoryAPI.getAll({ limit: 5 }) : Promise.resolve(null),
    ]).then(([ordRes, invRes]) => {
      setOrders(ordRes.data.data || []);
      if (invRes) setInventory(invRes.data.data || []);
    }).finally(() => setLoading(false));
  }, [user.role]);

  const statusCounts = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  const recentEvents = events.slice(0, 5);

  if (loading) return <div style={styles.loading}>Loading dashboard…</div>;

  return (
    <div style={styles.page}>
      <div style={styles.topBar}>
        <div>
          <h1 style={styles.pageTitle}>Dashboard</h1>
          <p style={styles.pageSubtitle}>Welcome back, {user.name} · {user.role}</p>
        </div>
        <div style={{ ...styles.liveChip, background: connected ? '#052e16' : '#1c0a0a', borderColor: connected ? '#166534' : '#7f1d1d' }}>
          <span style={{ ...styles.liveDot, background: connected ? '#22c55e' : '#ef4444' }} />
          {connected ? 'Live' : 'Disconnected'}
        </div>
      </div>

      {/* Stats row */}
      <div style={styles.statsGrid}>
        {[
          { label: 'Total Orders',   value: orders.length,     icon: '📦', color: '#6366f1' },
          { label: 'Delivered',      value: statusCounts.DELIVERED || 0, icon: '✅', color: '#22c55e' },
          { label: 'In Transit',     value: (statusCounts.SHIPPED || 0) + (statusCounts.OUT_FOR_DELIVERY || 0), icon: '🚚', color: '#f59e0b' },
          { label: 'Inventory SKUs', value: inventory.length,  icon: '🏪', color: '#8b5cf6' },
        ].map((stat) => (
          <div key={stat.label} style={styles.statCard}>
            <div style={{ ...styles.statIcon, background: stat.color + '22' }}>{stat.icon}</div>
            <div>
              <div style={styles.statValue}>{stat.value}</div>
              <div style={styles.statLabel}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.gridTwo}>
        {/* Recent Orders */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>Recent Orders</span>
            <Link to="/orders" style={styles.viewAll}>View all →</Link>
          </div>
          {orders.length === 0 ? (
            <p style={styles.empty}>No orders yet.</p>
          ) : (
            orders.map((order) => (
              <Link to={`/orders/${order.id}`} key={order.id} style={styles.orderRow}>
                <div>
                  <div style={styles.orderId}>#{order.id.slice(-8).toUpperCase()}</div>
                  <div style={styles.orderMeta}>₹{Number(order.total_amount).toLocaleString('en-IN')}</div>
                </div>
                <span style={{ ...styles.badge, background: STATUS_COLOR[order.status] + '22', color: STATUS_COLOR[order.status] }}>
                  {order.status}
                </span>
              </Link>
            ))
          )}
        </div>

        {/* Live Events */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>Live Events</span>
            <Link to="/live-feed" style={styles.viewAll}>Full feed →</Link>
          </div>
          {recentEvents.length === 0 ? (
            <p style={styles.empty}>No events yet. Try updating an order status.</p>
          ) : (
            recentEvents.map((ev) => (
              <div key={ev.id} style={styles.eventRow}>
                <div style={styles.eventType}>{ev.eventName.replace(':', ' › ').toUpperCase()}</div>
                <div style={styles.eventTime}>{formatDistanceToNow(ev.receivedAt, { addSuffix: true })}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Inventory Low Stock Alert (sellers/admin) */}
      {user.role !== 'buyer' && inventory.filter(i => i.quantity <= i.low_stock_threshold).length > 0 && (
        <div style={styles.alertBox}>
          <span style={styles.alertIcon}>⚠️</span>
          <span style={styles.alertText}>
            {inventory.filter(i => i.quantity <= i.low_stock_threshold).length} item(s) are low on stock.
          </span>
          <Link to="/inventory?low_stock=true" style={styles.alertLink}>View →</Link>
        </div>
      )}
    </div>
  );
}

const styles = {
  page:        { maxWidth: 1100 },
  loading:     { color: '#94a3b8', padding: 40 },
  topBar:      { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 },
  pageTitle:   { color: '#fff', fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.5px' },
  pageSubtitle:{ color: '#64748b', fontSize: 14, marginTop: 4 },
  liveChip:    { display: 'flex', alignItems: 'center', gap: 6, border: '1px solid', borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 600, color: '#e2e8f0' },
  liveDot:     { width: 7, height: 7, borderRadius: '50%' },
  statsGrid:   { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 },
  statCard:    { background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12, padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16 },
  statIcon:    { width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 },
  statValue:   { fontSize: 26, fontWeight: 700, color: '#fff', lineHeight: 1 },
  statLabel:   { fontSize: 12, color: '#64748b', marginTop: 4 },
  gridTwo:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 },
  panel:       { background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12, padding: '20px 22px' },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  panelTitle:  { color: '#e2e8f0', fontWeight: 600, fontSize: 15 },
  viewAll:     { color: '#6366f1', fontSize: 13, textDecoration: 'none' },
  orderRow:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e2235', textDecoration: 'none' },
  orderId:     { color: '#e2e8f0', fontSize: 13, fontWeight: 600, fontFamily: 'monospace' },
  orderMeta:   { color: '#64748b', fontSize: 12, marginTop: 2 },
  badge:       { fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20 },
  eventRow:    { display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #1e2235' },
  eventType:   { color: '#a5b4fc', fontSize: 11, fontWeight: 700, letterSpacing: '0.5px' },
  eventTime:   { color: '#475569', fontSize: 11 },
  empty:       { color: '#475569', fontSize: 13, padding: '8px 0' },
  alertBox:    { background: '#451a03', border: '1px solid #92400e', borderRadius: 10, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 },
  alertIcon:   { fontSize: 18 },
  alertText:   { color: '#fde68a', fontSize: 14, flex: 1 },
  alertLink:   { color: '#fbbf24', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
};
