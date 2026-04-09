import { useSocket } from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';
import { useEffect } from 'react';
import { formatDistanceToNow, format } from 'date-fns';

const EVENT_META = {
  'order:created':        { label: 'ORDER CREATED',        color: '#6366f1', icon: '🆕' },
  'order:new':            { label: 'NEW ORDER (SELLER)',    color: '#8b5cf6', icon: '🔔' },
  'order:status_updated': { label: 'STATUS UPDATE',        color: '#3b82f6', icon: '🔄' },
  'order:cancelled':      { label: 'ORDER CANCELLED',      color: '#ef4444', icon: '❌' },
  'inventory:updated':    { label: 'INVENTORY UPDATED',    color: '#22c55e', icon: '📦' },
  'inventory:low_stock':  { label: 'LOW STOCK ALERT',      color: '#f59e0b', icon: '⚠️' },
  'inventory:out_of_stock':{ label: 'OUT OF STOCK',        color: '#ef4444', icon: '🚨' },
};

export default function LiveFeedPage() {
  const { user } = useAuth();
  const { connected, events, subscribeToSeller } = useSocket();

  // Sellers auto-subscribe to their own channel
  useEffect(() => {
    if (user?.role === 'seller') subscribeToSeller(user.id);
  }, [user, subscribeToSeller]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Live Event Feed</h1>
          <p style={styles.subtitle}>Real-time stream from Kafka → WebSocket</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ ...styles.chip, background: connected ? '#052e16' : '#1c0a0a', borderColor: connected ? '#166534' : '#7f1d1d', color: connected ? '#4ade80' : '#f87171' }}>
            <span style={{ ...styles.dot, background: connected ? '#22c55e' : '#ef4444', animation: connected ? 'pulse 1.5s infinite' : 'none' }} />
            {connected ? 'Connected' : 'Disconnected'}
          </div>
          <div style={styles.counter}>{events.length} events</div>
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      {events.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>⚡</div>
          <p style={styles.emptyText}>Waiting for events…</p>
          <p style={styles.emptyHint}>Update an order status or inventory item to see live events here.</p>
        </div>
      ) : (
        <div style={styles.feed}>
          {events.map((ev) => {
            const meta = EVENT_META[ev.eventName] || { label: ev.eventName.toUpperCase(), color: '#94a3b8', icon: '•' };
            return (
              <div key={ev.id} style={styles.eventCard}>
                <div style={{ ...styles.eventBar, background: meta.color }} />
                <div style={styles.eventContent}>
                  <div style={styles.eventTop}>
                    <span style={styles.eventIcon}>{meta.icon}</span>
                    <span style={{ ...styles.eventLabel, color: meta.color }}>{meta.label}</span>
                    <span style={styles.eventAge}>{formatDistanceToNow(ev.receivedAt, { addSuffix: true })}</span>
                    <span style={styles.eventTimestamp}>{format(ev.receivedAt, 'HH:mm:ss.SSS')}</span>
                  </div>
                  <div style={styles.payloadGrid}>
                    {Object.entries(ev.data)
                      .filter(([k]) => !['eventType', 'timestamp'].includes(k))
                      .map(([key, val]) => (
                        <div key={key} style={styles.payloadRow}>
                          <span style={styles.payloadKey}>{key}</span>
                          <span style={styles.payloadVal}>{String(val)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  page:            { maxWidth: 900 },
  header:          { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title:           { color: '#fff', fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.5px' },
  subtitle:        { color: '#64748b', fontSize: 14, marginTop: 4 },
  chip:            { display: 'flex', alignItems: 'center', gap: 6, border: '1px solid', borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 600 },
  dot:             { width: 7, height: 7, borderRadius: '50%' },
  counter:         { background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 20, padding: '6px 14px', fontSize: 13, color: '#94a3b8' },
  empty:           { textAlign: 'center', padding: '80px 40px', background: '#1a1d27', borderRadius: 16, border: '1px solid #2d3148' },
  emptyIcon:       { fontSize: 48, marginBottom: 16 },
  emptyText:       { color: '#e2e8f0', fontSize: 18, fontWeight: 600, margin: '0 0 8px' },
  emptyHint:       { color: '#475569', fontSize: 14, margin: 0 },
  feed:            { display: 'flex', flexDirection: 'column', gap: 10 },
  eventCard:       { background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 10, display: 'flex', overflow: 'hidden' },
  eventBar:        { width: 4, flexShrink: 0 },
  eventContent:    { padding: '14px 18px', flex: 1 },
  eventTop:        { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 },
  eventIcon:       { fontSize: 16 },
  eventLabel:      { fontSize: 12, fontWeight: 700, letterSpacing: '0.5px', flex: 1 },
  eventAge:        { fontSize: 11, color: '#475569' },
  eventTimestamp:  { fontSize: 11, color: '#334155', fontFamily: 'monospace' },
  payloadGrid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '4px 24px' },
  payloadRow:      { display: 'flex', gap: 8, fontSize: 12 },
  payloadKey:      { color: '#64748b', fontFamily: 'monospace', flexShrink: 0 },
  payloadVal:      { color: '#a5b4fc', fontFamily: 'monospace', wordBreak: 'break-all' },
};
