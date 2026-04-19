import axios from 'axios';

/**
 * Axios instance used by every client-side API module.
 *
 * Authentication is handled via an httpOnly session cookie set by the
 * server on login/register. `withCredentials: true` tells the browser
 * to include the cookie on cross-origin-style requests (same-origin in
 * dev, but required for Vercel's rewrite-based routing and any future
 * cross-origin deployments).
 */
const client = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Don't redirect for auth endpoints — let the login/register pages
      // surface the server's error to the user.
      const url = error.config?.url || '';
      const isAuthEndpoint = url.startsWith('/auth/') || url.startsWith('auth/');
      if (!isAuthEndpoint) {
        // The session cookie is invalid or missing. Redirect to /login;
        // on reload the authStore's initialize() will call /api/auth/me
        // and clear any stale cached user.
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default client;
