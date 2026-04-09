import { useEffect, useState } from 'react';
import { inventoryAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import toast from 'react-hot-toast';

export default function InventoryPage() {
  const { user } = useAuth();
  const { on }   = useSocket();
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [restockId, setRestockId]       = useState(null);
  const [restockQty, setRestockQty]     = useState('');
  const [showCreate, setShowCreate]     = useState(false);
  const [newItem, setNewItem] = useState({ name: '', category: 'other', quantity: '', price_per_unit: '', unit: 'units', low_stock_threshold: 10 });
  const [creating, setCreating] = useState(false);

  function fetchItems() {
    inventoryAPI.getAll({ search: search || undefined, low_stock: lowStockOnly || undefined })
      .then(res => setItems(res.data.data || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchItems(); }, [search, lowStockOnly]);

  // Live update inventory via WebSocket
  useEffect(() => {
    return on('inventory:updated', (data) => {
      setItems(prev => prev.map(i => i.id === data.itemId ? { ...i, quantity: data.quantity } : i));
    });
  }, [on]);

  async function handleRestock(id) {
    if (!restockQty || restockQty <= 0) return toast.error('Enter a valid quantity');
    try {
      await inventoryAPI.restock(id, { quantity: parseInt(restockQty) });
      toast.success(`Restocked ${restockQty} units`);
      setRestockId(null); setRestockQty('');
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Restock failed');
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await inventoryAPI.create({ ...newItem, quantity: parseInt(newItem.quantity), price_per_unit: parseFloat(newItem.price_per_unit) });
      toast.success('Item created');
      setShowCreate(false);
      setNewItem({ name: '', category: 'other', quantity: '', price_per_unit: '', unit: 'units', low_stock_threshold: 10 });
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  const CATEGORIES = ['seafood','vegetables','electronics','furniture','vehicles','other'];

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Inventory</h1>
        <div style={styles.headerRight}>
          <label style={styles.toggle}>
            <input type="checkbox" checked={lowStockOnly} onChange={e => setLowStockOnly(e.target.checked)} />
            <span style={{ marginLeft: 6, color: '#f59e0b', fontWeight: 600 }}>⚠️ Low stock only</span>
          </label>
          {user.role !== 'buyer' && (
            <button style={styles.addBtn} onClick={() => setShowCreate(v => !v)}>+ Add Item</button>
          )}
        </div>
      </div>

      <input style={styles.searchInput} placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)} />

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} style={styles.createForm}>
          <h3 style={{ color: '#e2e8f0', margin: '0 0 16px', fontSize: 15 }}>New Inventory Item</h3>
          <div style={styles.formGrid}>
            {[
              { key: 'name', label: 'Name', type: 'text' },
              { key: 'quantity', label: 'Qty', type: 'number' },
              { key: 'price_per_unit', label: 'Price (₹)', type: 'number' },
              { key: 'unit', label: 'Unit', type: 'text' },
            ].map(({ key, label, type }) => (
              <div key={key} style={styles.formField}>
                <label style={styles.formLabel}>{label}</label>
                <input style={styles.formInput} type={type} required value={newItem[key]}
                  onChange={e => setNewItem(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            <div style={styles.formField}>
              <label style={styles.formLabel}>Category</label>
              <select style={styles.formInput} value={newItem.category} onChange={e => setNewItem(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <button style={{ ...styles.addBtn, opacity: creating ? 0.6 : 1 }} disabled={creating} type="submit">
            {creating ? 'Creating…' : 'Create Item'}
          </button>
        </form>
      )}

      {loading ? (
        <p style={{ color: '#64748b' }}>Loading…</p>
      ) : items.length === 0 ? (
        <div style={styles.empty}><p>No items found.</p></div>
      ) : (
        <div style={styles.grid}>
          {items.map(item => {
            const isLow = item.quantity <= item.low_stock_threshold;
            const isOut = item.quantity === 0;
            return (
              <div key={item.id} style={{ ...styles.card, borderColor: isOut ? '#7f1d1d' : isLow ? '#78350f' : '#2d3148' }}>
                <div style={styles.cardTop}>
                  <span style={styles.itemName}>{item.name}</span>
                  <span style={styles.category}>{item.category}</span>
                </div>
                <div style={styles.stockRow}>
                  <span style={{ ...styles.qty, color: isOut ? '#ef4444' : isLow ? '#f59e0b' : '#22c55e' }}>
                    {isOut ? '🚨 Out of stock' : isLow ? `⚠️ ${item.quantity} ${item.unit}` : `${item.quantity} ${item.unit}`}
                  </span>
                  <span style={styles.price}>₹{Number(item.price_per_unit).toLocaleString('en-IN')}/{item.unit}</span>
                </div>
                <div style={styles.seller}>by {item.seller_name}</div>

                {user.role !== 'buyer' && (
                  restockId === item.id ? (
                    <div style={styles.restockRow}>
                      <input style={styles.restockInput} type="number" min="1" placeholder="Qty"
                        value={restockQty} onChange={e => setRestockQty(e.target.value)} autoFocus />
                      <button style={styles.restockConfirm} onClick={() => handleRestock(item.id)}>Restock</button>
                      <button style={styles.restockCancel} onClick={() => { setRestockId(null); setRestockQty(''); }}>✕</button>
                    </div>
                  ) : (
                    <button style={styles.restockBtn} onClick={() => setRestockId(item.id)}>Restock</button>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  page:          { maxWidth: 1100 },
  header:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title:         { color: '#fff', fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.5px' },
  headerRight:   { display: 'flex', alignItems: 'center', gap: 16 },
  toggle:        { display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 13 },
  addBtn:        { background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  searchInput:   { background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8, padding: '10px 14px', color: '#e2e8f0', fontSize: 14, width: '100%', marginBottom: 20, boxSizing: 'border-box', outline: 'none' },
  createForm:    { background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12, padding: '20px 22px', marginBottom: 24 },
  formGrid:      { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 },
  formField:     { display: 'flex', flexDirection: 'column', gap: 5 },
  formLabel:     { color: '#64748b', fontSize: 12, fontWeight: 600 },
  formInput:     { background: '#0f1117', border: '1px solid #2d3148', borderRadius: 7, padding: '8px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none' },
  empty:         { background: '#1a1d27', borderRadius: 12, padding: 40, textAlign: 'center', color: '#475569' },
  grid:          { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 },
  card:          { background: '#1a1d27', border: '1px solid', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 },
  cardTop:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  itemName:      { color: '#e2e8f0', fontWeight: 600, fontSize: 14 },
  category:      { background: '#1e2235', color: '#64748b', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase' },
  stockRow:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  qty:           { fontWeight: 700, fontSize: 14 },
  price:         { color: '#6366f1', fontSize: 12, fontWeight: 600 },
  seller:        { color: '#475569', fontSize: 11 },
  restockBtn:    { background: '#1e3a5f', color: '#93c5fd', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
  restockRow:    { display: 'flex', gap: 6, marginTop: 4 },
  restockInput:  { background: '#0f1117', border: '1px solid #2d3148', borderRadius: 6, padding: '5px 10px', color: '#e2e8f0', fontSize: 13, width: 70, outline: 'none' },
  restockConfirm:{ background: '#052e16', color: '#4ade80', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  restockCancel: { background: '#1c0a0a', color: '#f87171', border: 'none', borderRadius: 6, padding: '5px 8px', fontSize: 12, cursor: 'pointer' },
};
