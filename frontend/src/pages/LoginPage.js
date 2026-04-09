import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate   = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      toast.success(`Welcome back, ${user.name}!`);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logo}>⚡</div>
          <h1 style={styles.title}>TrackFlow</h1>
          <p style={styles.subtitle}>Real-time Order & Inventory System</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="you@example.com"
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
              required
            />
          </div>
          <button style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }} disabled={loading} type="submit">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p style={styles.footer}>
          No account? <Link to="/register" style={styles.link}>Register</Link>
        </p>

        <div style={styles.demoBox}>
          <p style={styles.demoTitle}>Demo credentials</p>
          <p style={styles.demoLine}>Admin: admin@example.com / password123</p>
          <p style={styles.demoLine}>Seller: seller@example.com / password123</p>
          <p style={styles.demoLine}>Buyer: buyer@example.com / password123</p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page:      { minHeight: '100vh', background: '#0f1117', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif" },
  card:      { background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 16, padding: '40px 36px', width: '100%', maxWidth: 420 },
  header:    { textAlign: 'center', marginBottom: 32 },
  logo:      { fontSize: 40, marginBottom: 8 },
  title:     { color: '#fff', fontSize: 26, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.5px' },
  subtitle:  { color: '#64748b', fontSize: 14, margin: 0 },
  form:      { display: 'flex', flexDirection: 'column', gap: 18 },
  field:     { display: 'flex', flexDirection: 'column', gap: 6 },
  label:     { color: '#94a3b8', fontSize: 13, fontWeight: 500 },
  input:     { background: '#0f1117', border: '1px solid #2d3148', borderRadius: 8, padding: '10px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none' },
  btn:       { background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '12px', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
  footer:    { textAlign: 'center', color: '#64748b', fontSize: 13, marginTop: 20 },
  link:      { color: '#6366f1', textDecoration: 'none' },
  demoBox:   { background: '#0f1117', borderRadius: 8, padding: '12px 16px', marginTop: 20 },
  demoTitle: { color: '#6366f1', fontSize: 12, fontWeight: 600, margin: '0 0 6px' },
  demoLine:  { color: '#64748b', fontSize: 11, margin: '2px 0', fontFamily: 'monospace' },
};
