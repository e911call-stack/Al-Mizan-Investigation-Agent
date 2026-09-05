// TEMPORARY diagnostic route. GET this directly in the browser or via curl —
// no password needed to call it (it doesn't reveal the real secret). Delete
// this file once the password mismatch is resolved.

export const dynamic = 'force-dynamic';

function describe(value) {
  if (value === undefined) return { present: false };
  return {
    present: true,
    length: value.length,
    first3: value.slice(0, 3),
    last3: value.slice(-3),
    hasLeadingWhitespace: /^\s/.test(value),
    hasTrailingWhitespace: /\s$/.test(value),
    containsNewline: value.includes('\n') || value.includes('\r'),
  };
}

export async function GET() {
  return Response.json({ ADMIN_PASSWORD: describe(process.env.ADMIN_PASSWORD) });
}
