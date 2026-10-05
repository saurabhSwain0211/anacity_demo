const BASE =
  import.meta.env.VITE_API_URL || 'https://anacity-demo.onrender.com/api';
  

export async function api(path, { token, ...options } = {}) {
  const headers = {
    ...(options.body instanceof FormData
      ? {}
      : { 'Content-Type': 'application/json' }),

    ...(token
      ? { Authorization: `Bearer ${token}` }
      : {}),

    ...options.headers
  };

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      data.error || `Request failed (${res.status})`
    );
  }

  return data;
}