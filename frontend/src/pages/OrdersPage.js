import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ordersAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

const STATUS_COLOR = {
  PLACED:'#6366f1', CONFIRMED:'#3b82f6', PACKED:'#8b5cf6',
  SHIPPED:'#f59e0b', OUT_FOR_DELIVERY:'#f97316', DELIVERED:'#22c55e',
  CANCELLED:'#ef4444', RETURNED:'#64748b',
};

const SELLER_TRANSITIONS = {
  PLACED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED'],
  SHIPPED: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
};

export default function OrdersPage() {
  const { user } = useAuth();
  const { on } = useSocket();
  const [orders, setOrders]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [updating, setUpdating]     = useState(null);

  function fetchOrders() {
    ordersAPI.getAll({ status: statusFilter || undefined, limit: 50 })
      .then(res => setOrders(res.data.data || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchOrders(); }, [statusFilter]);

  // Live update — patch orders list in-place when WebSocket event arrives
  useEffect(() => {
    return on('order:status_updated', (data) => {
      setOrders(prev => prev.map(o =>
        o.id === data.orderId ? { ...o, status: data.newStatus } : o
      ));
    });
  }, [on]);

  async function handleStatusUpdate(orderId, status) {
    setUpdating(orderId);
    try {
      await ordersAPI.updateStatus(orderId, { status });
      toast.success(`Status updated to ${status}`);
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setUpdating(null);
    }
  }

  const STATUSES = ['PLACED','CONFIRMED','PACKED','SHIPPED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED','RETURNED'];

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Orders</h1>
        <select style={styles.filter} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <p style={styles.loading}>Loading…</p>
      ) : orders.length === 0 ? (
        <div style={styles.empty}><p>No orders found.</p></div>
      ) : (
        <div style={styles.table}>
          <div style={styles.tableHead}>
            {['Order ID', 'Amount', 'Status', 'Date', ...(user.role !== 'buyer' ? ['Action'] : [])].map(h => (
              <div key={h} style={styles.th}>{h}</div>
            ))}
          </div>
          {orders.map(order => (
            <div key={order.id} style={styles.row}>
              <div style={styles.td}>
                <Link to={`/orders/${order.id}`} style={styles.orderLink}>
                  #{order.id.slice(-8).toUpperCase()}
                </Link>
                <div style={styles.subText}>{order.buyer_name || order.seller_name}</div>
              </div>
              <div style={styles.td}>
                <span style={styles.amount}>₹{Number(order.total_amount).toLocaleString('en-IN')}</span>
              </div>
              <div style={styles.td}>
                <span style={{ ...styles.badge, background: STATUS_COLOR[order.status] + '22', color: STATUS_COLOR[order.status] }}>
                  {order.status}
                </span>
              </div>
              <div style={styles.td}>
                <span style={styles.date}>
                  {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                </span>
              </div>
              {user.role !== 'buyer' && (
                <div style={styles.td}>
                  {SELLER_TRANSITIONS[order.status]?.length > 0 ? (
                    <div style={styles.actionGroup}>
                      {SELLER_TRANSITIONS[order.status].map(next => (
                        <button
                          key={next}
                          style={{ ...styles.actionBtn, opacity: updating === order.id ? 0.5 : 1,
                            background: next === 'CANCELLED' ? '#7f1d1d' : '#1e3a5f', color: next === 'CANCELLED' ? '#fca5a5' : '#93c5fd' }}
                          disabled={updating === order.id}
                          onClick={() => handleStatusUpdate(order.id, next)}
                        >
                          {next}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span style={styles.noAction}>—</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  page:        { maxWidth: 1100 },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  title:       { color: '#fff', fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.5px' },
  filter:      { background: '#1a1d27', border: '1px solid #2d3148', color: '#e2e8f0', borderRadius: 8, padding: '8px 14px', fontSize: 14 },
  loading:     { color: '#64748b' },
  empty:       { background: '#1a1d27', borderRadius: 12, padding: 40, textAlign: 'center', color: '#475569' },
  table:       { background: '#1a1d27', borderRadius: 12, border: '1px solid #2d3148', overflow: 'hidden' },
  tableHead:   { display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 1.5fr 2fr', background: '#111420', padding: '12px 20px', borderBottom: '1px solid #2d3148' },
  th:          { color: '#64748b', fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' },
  row:         { display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 1.5fr 2fr', padding: '14px 20px', borderBottom: '1px solid #1e2235', alignItems: 'center' },
  td:          { color: '#e2e8f0', fontSize: 14 },
  orderLink:   { color: '#a5b4fc', textDecoration: 'none', fontFamily: 'monospace', fontWeight: 700 },
  subText:     { color: '#475569', fontSize: 12, marginTop: 2 },
  amount:      { color: '#22c55e', fontWeight: 600 },
  badge:       { fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 },
  date:        { color: '#64748b', fontSize: 12 },
  actionGroup: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  actionBtn:   { border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.3px' },
  noAction:    { color: '#334155', fontSize: 13 },
};
