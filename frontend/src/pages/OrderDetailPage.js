import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ordersAPI } from '../utils/api';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const STATUS_COLOR = {
  PLACED:'#6366f1', CONFIRMED:'#3b82f6', PACKED:'#8b5cf6',
  SHIPPED:'#f59e0b', OUT_FOR_DELIVERY:'#f97316', DELIVERED:'#22c55e',
  CANCELLED:'#ef4444', RETURNED:'#64748b',
};

const ALL_STEPS = ['PLACED','CONFIRMED','PACKED','SHIPPED','OUT_FOR_DELIVERY','DELIVERED'];

export default function OrderDetailPage() {
  const { id }     = useParams();
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const { subscribeToOrder, on } = useSocket();
  const [order, setOrder]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [note, setNote]       = useState('');

  function fetchOrder() {
    ordersAPI.getById(id).then(res => setOrder(res.data.data)).finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchOrder();
    subscribeToOrder(id);
  }, [id]);

  // Live patch — update status and push new history entry
  useEffect(() => {
    return on('order:status_updated', (data) => {
      if (data.orderId !== id) return;
      setOrder(prev => {
        if (!prev) return prev;
        const newEntry = { status: data.newStatus, note: data.note, created_at: new Date().toISOString(), updated_by_name: 'Live Update' };
        return { ...prev, status: data.newStatus, statusHistory: [...(prev.statusHistory || []), newEntry] };
      });
      toast.success(`Status updated: ${data.newStatus}`, { icon: '🔄' });
    });
  }, [on, id]);

  async function handleUpdate(status) {
    setUpdating(true);
    try {
      await ordersAPI.updateStatus(id, { status, note: note || undefined });
      setNote('');
      fetchOrder();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setUpdating(false);
    }
  }

  if (loading) return <div style={styles.loading}>Loading order…</div>;
  if (!order)  return <div style={styles.loading}>Order not found.</div>;

  const currentStep = ALL_STEPS.indexOf(order.status);
  const isFinal     = ['DELIVERED','CANCELLED','RETURNED'].includes(order.status);

  const NEXT_MAP = {
    PLACED: ['CONFIRMED','CANCELLED'],
    CONFIRMED: ['PACKED','CANCELLED'],
    PACKED: ['SHIPPED'],
    SHIPPED: ['OUT_FOR_DELIVERY'],
    OUT_FOR_DELIVERY: ['DELIVERED'],
  };

  return (
    <div style={styles.page}>
      <button style={styles.back} onClick={() => navigate('/orders')}>← Back to Orders</button>

      <div style={styles.topRow}>
        <div>
          <h1 style={styles.title}>Order #{id.slice(-8).toUpperCase()}</h1>
          <p style={styles.subtitle}>₹{Number(order.total_amount).toLocaleString('en-IN')} · {order.buyer_name || 'Buyer'}</p>
        </div>
        <span style={{ ...styles.statusBadge, background: STATUS_COLOR[order.status] + '22', color: STATUS_COLOR[order.status] }}>
          {order.status}
        </span>
      </div>

      {/* Progress bar (only for non-cancelled orders) */}
      {order.status !== 'CANCELLED' && order.status !== 'RETURNED' && (
        <div style={styles.progressBar}>
          {ALL_STEPS.map((step, i) => (
            <div key={step} style={styles.progressStep}>
              <div style={{ ...styles.progressDot,
                background: i <= currentStep ? STATUS_COLOR[ALL_STEPS[Math.min(currentStep, ALL_STEPS.length - 1)]] : '#2d3148',
                boxShadow: i === currentStep ? `0 0 0 4px ${STATUS_COLOR[order.status]}33` : 'none',
              }} />
              <div style={{ ...styles.progressLabel, color: i <= currentStep ? '#e2e8f0' : '#475569' }}>
                {step.replace('_', ' ')}
              </div>
              {i < ALL_STEPS.length - 1 && (
                <div style={{ ...styles.progressLine, background: i < currentStep ? '#6366f1' : '#2d3148' }} />
              )}
            </div>
          ))}
        </div>
      )}

      <div style={styles.gridTwo}>
        {/* Order Items */}
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Items</h3>
          {(order.items || []).filter(Boolean).map((item, i) => (
            <div key={i} style={styles.itemRow}>
              <div style={styles.itemName}>{item.item_name}</div>
              <div style={styles.itemQty}>× {item.quantity}</div>
              <div style={styles.itemPrice}>₹{Number(item.total_price).toLocaleString('en-IN')}</div>
            </div>
          ))}
          <div style={styles.totalRow}>
            <span style={styles.totalLabel}>Total</span>
            <span style={styles.totalValue}>₹{Number(order.total_amount).toLocaleString('en-IN')}</span>
          </div>
          {order.shipping_address && (
            <div style={styles.shippingBox}>
              <div style={styles.shippingLabel}>Ship to</div>
              <div style={styles.shippingAddr}>{order.shipping_address}</div>
            </div>
          )}
        </div>

        {/* Status History (append-only log) */}
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Status History</h3>
          <div style={styles.timeline}>
            {(order.statusHistory || []).map((entry, i) => (
              <div key={i} style={styles.timelineEntry}>
                <div style={{ ...styles.timelineDot, background: STATUS_COLOR[entry.status] || '#6366f1' }} />
                <div style={styles.timelineBody}>
                  <span style={{ ...styles.timelineStatus, color: STATUS_COLOR[entry.status] }}>{entry.status}</span>
                  {entry.note && <span style={styles.timelineNote}>{entry.note}</span>}
                  <div style={styles.timelineMeta}>
                    {entry.updated_by_name && <span>{entry.updated_by_name} · </span>}
                    {format(new Date(entry.created_at), 'dd MMM yyyy HH:mm')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action panel (sellers/admin only, non-final orders) */}
      {user.role !== 'buyer' && !isFinal && NEXT_MAP[order.status]?.length > 0 && (
        <div style={styles.actionPanel}>
          <h3 style={styles.panelTitle}>Update Status</h3>
          <input style={styles.noteInput} placeholder="Optional note…" value={note} onChange={e => setNote(e.target.value)} />
          <div style={styles.actionBtns}>
            {NEXT_MAP[order.status].map(next => (
              <button key={next} disabled={updating}
                style={{ ...styles.actionBtn,
                  background: next === 'CANCELLED' ? '#7f1d1d' : '#1e3a5f',
                  color: next === 'CANCELLED' ? '#fca5a5' : '#93c5fd',
                  opacity: updating ? 0.6 : 1 }}
                onClick={() => handleUpdate(next)}
              >
                {updating ? '…' : `Mark as ${next}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page:           { maxWidth: 1000 },
  loading:        { color: '#94a3b8', padding: 40 },
  back:           { background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 14, padding: 0, marginBottom: 24 },
  topRow:         { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title:          { color: '#fff', fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.5px' },
  subtitle:       { color: '#64748b', fontSize: 14, marginTop: 4 },
  statusBadge:    { fontSize: 14, fontWeight: 700, padding: '6px 16px', borderRadius: 20 },
  progressBar:    { display: 'flex', alignItems: 'flex-start', gap: 0, marginBottom: 32, background: '#1a1d27', borderRadius: 12, padding: '20px 24px', border: '1px solid #2d3148' },
  progressStep:   { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, position: 'relative' },
  progressDot:    { width: 12, height: 12, borderRadius: '50%', zIndex: 1, transition: 'all 0.3s' },
  progressLabel:  { fontSize: 10, textAlign: 'center', marginTop: 6, fontWeight: 600, letterSpacing: '0.3px' },
  progressLine:   { position: 'absolute', top: 6, left: '50%', width: '100%', height: 2, zIndex: 0, transition: 'background 0.3s' },
  gridTwo:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 },
  panel:          { background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12, padding: '20px 22px' },
  panelTitle:     { color: '#e2e8f0', fontSize: 15, fontWeight: 600, margin: '0 0 16px' },
  itemRow:        { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #1e2235' },
  itemName:       { flex: 1, color: '#e2e8f0', fontSize: 14 },
  itemQty:        { color: '#64748b', fontSize: 13 },
  itemPrice:      { color: '#22c55e', fontWeight: 600, fontSize: 14 },
  totalRow:       { display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', marginTop: 4 },
  totalLabel:     { color: '#94a3b8', fontWeight: 600 },
  totalValue:     { color: '#fff', fontWeight: 700, fontSize: 16 },
  shippingBox:    { background: '#111420', borderRadius: 8, padding: '10px 14px', marginTop: 14 },
  shippingLabel:  { color: '#64748b', fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 4 },
  shippingAddr:   { color: '#94a3b8', fontSize: 13 },
  timeline:       { display: 'flex', flexDirection: 'column', gap: 16 },
  timelineEntry:  { display: 'flex', gap: 14, alignItems: 'flex-start' },
  timelineDot:    { width: 10, height: 10, borderRadius: '50%', marginTop: 4, flexShrink: 0 },
  timelineBody:   { flex: 1 },
  timelineStatus: { fontSize: 13, fontWeight: 700 },
  timelineNote:   { fontSize: 12, color: '#94a3b8', marginLeft: 8 },
  timelineMeta:   { fontSize: 11, color: '#475569', marginTop: 2 },
  actionPanel:    { background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12, padding: '20px 22px' },
  noteInput:      { background: '#0f1117', border: '1px solid #2d3148', borderRadius: 8, padding: '9px 14px', color: '#e2e8f0', fontSize: 14, width: '100%', marginBottom: 14, boxSizing: 'border-box', outline: 'none' },
  actionBtns:     { display: 'flex', gap: 10 },
  actionBtn:      { border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.3px' },
};
