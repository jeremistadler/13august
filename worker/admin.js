const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function authenticated(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Basic ')) return false;
  let supplied;
  try { supplied = atob(authorization.slice(6)); } catch { return false; }
  const actual = await digest(supplied);
  const expected = await digest(`${env.ADMIN_USERNAME}:${env.ADMIN_PASSWORD}`);
  let difference = 0;
  for (let index = 0; index < actual.length; index++) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

export async function admin(request, env) {
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) return new Response('Administration är inte tillgänglig.', { status: 503, headers });
  if (!await authenticated(request, env)) return new Response('Logga in för att se anmälningarna.', {
    status: 401, headers: { ...headers, 'WWW-Authenticate': 'Basic realm="Anmälningar", charset="UTF-8"' },
  });
  if (request.method !== 'GET') return new Response('Metoden stöds inte.', { status: 405, headers: { ...headers, Allow: 'GET' } });
  try {
    const { results } = await env.DB.prepare(`SELECT name, attending, companions, needs_bed, bed_stay, comment, phone, brings_food, food_note, created_at, updated_at FROM responses ORDER BY updated_at DESC`).all();
    const nights = { 'fri-sat': 'Fredag–lördag', 'sat-sun': 'Lördag–söndag', 'fri-sun': 'Fredag–söndag' };
    const date = value => new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Stockholm' }).format(new Date(value));
    const field = (label, value) => `<dt>${escape(label)}</dt><dd>${escape(value || '—')}</dd>`;
    const cards = results.map(row => `<article><h2>${escape(row.name)}</h2><dl>${[
      field('Kommer', row.attending ? 'Ja' : 'Nej'),
      field('Tar med sig', row.companions),
      field('Telefonnummer', row.phone),
      field('Önskar sängplats', row.needs_bed ? 'Ja' : 'Nej'),
      field('Nätter', nights[row.bed_stay]),
      field('Tar med mat', row.brings_food ? 'Ja' : 'Nej'),
      field('Mat och annat att ta med', row.food_note),
      field('Kommentar', row.comment),
      field('Inskickat', date(row.created_at)),
      field('Senast ändrat', date(row.updated_at)),
    ].join('')}</dl></article>`).join('');
    return new Response(`<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Anmälningar – Administration</title><style>
      *{box-sizing:border-box}body{margin:0;background:#dceffa;color:#28552e;font:17px/1.5 system-ui,sans-serif}main{max-width:1000px;margin:auto;padding:32px 20px}h1{color:#e21919}h2{margin-top:0}article{background:#e0edcf;padding:24px;margin:24px 0}dl{display:grid;grid-template-columns:minmax(150px,1fr) 3fr;gap:10px 24px}dt{font-weight:600}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:550px){dl{grid-template-columns:1fr;gap:4px}dd{margin-bottom:12px}}
    </style><main><h1>Anmälningar</h1><p>${results.length} svar · ${results.filter(row => row.attending).length} anmälningar med ”Jag kommer”. Medföljande personer tillkommer.</p><p>Ladda om sidan för att se nya eller ändrade svar.</p>${cards || '<p>Inga svar har skickats in ännu.</p>'}</main></html>`, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  } catch {
    return new Response('Anmälningarna kunde inte hämtas. Försök igen.', { status: 503, headers });
  }
}
