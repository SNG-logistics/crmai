import axios from 'axios';
import { getIdToken } from './firebase';

const API_URL = typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000');

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true'
  },
  timeout: 30000,
});

// Request interceptor — attach a fresh Firebase ID token (auto-refreshed) + tenant.
api.interceptors.request.use(async (config) => {
  if (typeof window !== 'undefined') {
    let token: string | null = null;
    try { token = await getIdToken(); } catch { /* ignore */ }
    if (!token) token = localStorage.getItem('crm_token'); // legacy fallback
    const tenantId = localStorage.getItem('crm_tenant_id');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    if (tenantId) config.headers['x-tenant-id'] = tenantId;
  }
  return config;
});

// Response interceptor — handle 401
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const onLoginPage = window.location.pathname.startsWith('/login');
      localStorage.removeItem('crm_token');
      localStorage.removeItem('crm_user');
      localStorage.removeItem('crm_tenant');
      localStorage.removeItem('crm_tenant_id');
      // Don't bounce while we're on /login (e.g. an un-provisioned account) —
      // the login page surfaces a clear message instead.
      if (!onLoginPage) window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
