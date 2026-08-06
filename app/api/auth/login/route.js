import { signSession } from '../../../../lib/auth';

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { body = {}; }

  const appPassword = process.env.APP_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!appPassword || !secret) {
    return Response.json({ error: 'Auth is not configured on the server. Add APP_PASSWORD and SESSION_SECRET in Vercel environment variables.' }, { status: 500 });
  }

  if (body.password !== appPassword) {
    return Response.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  const token = await signSession(secret);
  const res = Response.json({ ok: true });
  res.headers.set(
    'Set-Cookie',
    `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}`
  );
  return res;
}
