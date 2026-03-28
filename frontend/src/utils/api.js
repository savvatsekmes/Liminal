/**
 * Authenticated fetch wrapper.
 * Attaches the JWT from localStorage to every request.
 * Automatically clears the token and reloads on 401.
 */
export async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('liminal_token');
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 401) {
    localStorage.removeItem('liminal_token');
    window.location.reload();
    // Return a never-resolving promise so the calling code doesn't continue
    return new Promise(() => {});
  }

  return res;
}

export function getStoredToken() {
  return localStorage.getItem('liminal_token');
}

export function setStoredToken(token) {
  localStorage.setItem('liminal_token', token);
}

export function clearStoredToken() {
  localStorage.removeItem('liminal_token');
}

/** Decode username from JWT payload without verifying signature (client-side only). */
export function getStoredUsername() {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp * 1000 < Date.now()) {
      clearStoredToken();
      return null;
    }
    return payload.username;
  } catch {
    return null;
  }
}

/** True if a valid (non-expired) token exists in localStorage. */
export function isAuthenticated() {
  return getStoredUsername() !== null;
}
