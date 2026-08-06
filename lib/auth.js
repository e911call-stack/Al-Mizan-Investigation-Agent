// Shared-password gate for the whole app — appropriate for a small
// internal team, not a substitute for real per-user accounts later.
// Uses Web Crypto (available as a global in both Next.js Edge middleware
// and modern Node) rather than Node's 'crypto' module or Buffer, so the
// exact same code works in middleware.js and in API routes.

function bufToBase64Url(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBuf(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

const SESSION_DAYS = 7;

export async function signSession(secret) {
  const expiry = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `authenticated:${expiry}`;
  const key = await getKey(secret);
  const enc = new TextEncoder();
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return `${payload}.${bufToBase64Url(sigBuf)}`;
}

export async function verifySession(token, secret) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const [tag, expiryStr] = payload.split(':');
  if (tag !== 'authenticated') return false;
  const expiry = parseInt(expiryStr, 10);
  if (!expiry || Date.now() > expiry) return false;

  const key = await getKey(secret);
  const enc = new TextEncoder();
  try {
    return await crypto.subtle.verify('HMAC', key, base64UrlToBuf(sig), enc.encode(payload));
  } catch (e) {
    return false;
  }
}
