export async function POST() {
  const res = Response.json({ ok: true });
  res.headers.set('Set-Cookie', 'session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  return res;
}
