// Addresses of the three backend services. VITE_ variables can override them,
// and the localhost values are the defaults for running on your own machine.
export const API = import.meta.env.VITE_API_URL || 'http://localhost:5001';
export const TASKS_API = import.meta.env.VITE_TASKS_URL || 'http://localhost:3000';
export const BEHAVIOUR_API = import.meta.env.VITE_BEHAVIOUR_URL || 'http://localhost:3002';

// Shared helper for calling the backend: sends JSON and returns the parsed response.
export async function request(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // fetch doesn't fail on a 400 or 500 by itself, so that check is done here.
  if (!res.ok) throw new Error(`${method} ${url} failed: ${await res.text()}`);
  return res.json();
}
