import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'buyer' });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await register(form);
      toast.success(`Welcome, ${user.name}!`);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  const s = styles;
  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <div style={s.logo}>⚡</div>
          <h1 style={s.title}>Create Account</h1>
          <p style={s.subtitle}>Join TrackFlow</p>
        </div>
        <form onSubmit={handleSubmit} style={s.form}>
          {[
            { label: 'Full Name', key: 'name', type: 'text', placeholder: 'John Doe' },
            { label: 'Email',     key: 'email', type: 'email', placeholder: 'you@example.com' },
            { label: 'Password',  key: 'password', type: 'password', placeholder: '••••••••' },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key} style={s.field}>
              <label style={s.label}>{label}</label>
              <input style={s.input} type={type} placeholder={placeholder} value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} required />
            </div>
          ))}
          <div style={s.field}>
            <label style={s.label}>Role</label>
            <select style={s.input} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="buyer">Buyer</option>
              <option value="seller">Seller</option>
            </select>
          </div>
          <button style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
        <p style={s.footer}>Already have an account? <Link to="/login" style={s.link}>Sign in</Link></p>
      </div>
    </div>
  );
}

const styles = {
  page:     { minHeight: '100vh', background: '#0f1117', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif" },
  card:     { background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 16, padding: '40px 36px', width: '100%', maxWidth: 420 },
  header:   { textAlign: 'center', marginBottom: 32 },
  logo:     { fontSize: 40, marginBottom: 8 },
  title:    { color: '#fff', fontSize: 26, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.5px' },
  subtitle: { color: '#64748b', fontSize: 14, margin: 0 },
  form:     { display: 'flex', flexDirection: 'column', gap: 16 },
  field:    { display: 'flex', flexDirection: 'column', gap: 6 },
  label:    { color: '#94a3b8', fontSize: 13, fontWeight: 500 },
  input:    { background: '#0f1117', border: '1px solid #2d3148', borderRadius: 8, padding: '10px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none' },
  btn:      { background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '12px', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
  footer:   { textAlign: 'center', color: '#64748b', fontSize: 13, marginTop: 20 },
  link:     { color: '#6366f1', textDecoration: 'none' },
};
