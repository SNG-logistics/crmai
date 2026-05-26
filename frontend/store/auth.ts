'use client';
import { create } from 'zustand';

interface AuthUser {
  id: string; tenantId: string; email: string; username: string;
  role: string; displayName: string; avatar?: string;
}
interface AuthTenant { id: string; name: string; slug: string; logo?: string; }
interface AuthState {
  user: AuthUser | null;
  tenant: AuthTenant | null;
  token: string | null;
  isLoading: boolean;
  setAuth: (user: AuthUser, tenant: AuthTenant, token: string) => void;
  logout: () => void;
  loadFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null, tenant: null, token: null, isLoading: true,
  setAuth: (user, tenant, token) => {
    localStorage.setItem('crm_token', token);
    localStorage.setItem('crm_user', JSON.stringify(user));
    localStorage.setItem('crm_tenant', JSON.stringify(tenant));
    localStorage.setItem('crm_tenant_id', tenant.id);
    set({ user, tenant, token, isLoading: false });
  },
  logout: () => {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    localStorage.removeItem('crm_tenant');
    localStorage.removeItem('crm_tenant_id');
    set({ user: null, tenant: null, token: null, isLoading: false });
  },
  loadFromStorage: () => {
    try {
      const token = localStorage.getItem('crm_token');
      const user = localStorage.getItem('crm_user');
      const tenant = localStorage.getItem('crm_tenant');
      if (token && user && tenant) {
        set({ token, user: JSON.parse(user), tenant: JSON.parse(tenant), isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch { set({ isLoading: false }); }
  },
}));
