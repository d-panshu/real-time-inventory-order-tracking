import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global error handling + auto-logout on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ─── Auth ──────────────────────────────────────────────────────────────
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login:    (data) => api.post('/auth/login', data),
  logout:   ()     => api.post('/auth/logout'),
  profile:  ()     => api.get('/auth/profile'),
};

// ─── Orders ───────────────────────────────────────────────────────────
export const ordersAPI = {
  getAll:       (params) => api.get('/orders', { params }),
  getById:      (id)     => api.get(`/orders/${id}`),
  create:       (data)   => api.post('/orders', data),
  updateStatus: (id, data) => api.patch(`/orders/${id}/status`, data),
};

// ─── Inventory ────────────────────────────────────────────────────────
export const inventoryAPI = {
  getAll:   (params) => api.get('/inventory', { params }),
  getById:  (id)     => api.get(`/inventory/${id}`),
  create:   (data)   => api.post('/inventory', data),
  update:   (id, data) => api.patch(`/inventory/${id}`, data),
  restock:  (id, data) => api.post(`/inventory/${id}/restock`, data),
};

export default api;
