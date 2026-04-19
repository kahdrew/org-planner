import { create } from 'zustand';
import type { User } from '@/types';
import * as authApi from '@/api/auth';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
}

/**
 * Authentication state.
 *
 * After migrating to session cookies, auth is entirely server-owned:
 * the httpOnly `orgplanner.sid` cookie is the source of truth. We no
 * longer persist a JWT in localStorage. We do still cache the `user`
 * object in localStorage so the app can hydrate immediately on reload
 * without a flash of the login screen; the cache is then validated
 * against the server via GET /api/auth/me and cleared if the session
 * is no longer valid.
 */
function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => {
  const cachedUser = readCachedUser();
  return {
    user: cachedUser,
    isAuthenticated: cachedUser !== null,

    login: async (email, password) => {
      const { user } = await authApi.login(email, password);
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, isAuthenticated: true });
    },

    register: async (email, password, name) => {
      const { user } = await authApi.register(email, password, name);
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, isAuthenticated: true });
    },

    logout: async () => {
      try {
        await authApi.logout();
      } catch {
        // Even if the logout request fails (offline, server error),
        // clear the client-side state so the user is signed out locally.
      }
      localStorage.removeItem('user');
      set({ user: null, isAuthenticated: false });
    },

    initialize: async () => {
      try {
        const { user } = await authApi.me();
        localStorage.setItem('user', JSON.stringify(user));
        set({ user, isAuthenticated: true });
      } catch {
        // /auth/me returned 401 (or network error). Treat as unauthenticated.
        localStorage.removeItem('user');
        set({ user: null, isAuthenticated: false });
      }
    },
  };
});
