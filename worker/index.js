import { admin } from './admin.js';

const COOKIE = 'arbetsdag_session';
const TEST_SITEKEY = '1x00000000000000000000BB';
const TEST_SECRET = '1x0000000000000000000000000000000AA';
const localHost = hostname => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}

function settings(env, url) {
  const local = localHost(url.hostname);
  const sitekey = local ? TEST_SITEKEY : env.TURNSTILE_SITE_KEY;
  const secret = local ? TEST_SECRET : env.TURNSTILE_SECRET_KEY;
  // Public testing credentials must never protect a deployed form.
  if (!sitekey || !secret || (!local && (sitekey === TEST_SITEKEY || secret === TEST_SECRET))) return null;
  return { sitekey, secret, local };
}

function session(request) {
  const token = request.headers.get('Cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

async function hash(token) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function cookie(token, url) {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${url.protocol === 'https:' ? '; Secure' : ''}`;
}

export function validateAnswers(body) {
  if (!body || typeof body.interest !== 'boolean' || typeof body.bed !== 'boolean') return null;
  const limits = { name: 120, companions: 300, comment: 2000, phone: 50 };
  const answers = { interest: body.interest, bed: body.bed };
  if (body.bed && !['fri-sat', 'sat-sun', 'fri-sun'].includes(body.bedStay)) return null;
  answers.bedStay = body.bed ? body.bedStay : '';
  if (body.bringsFood !== undefined && typeof body.bringsFood !== 'boolean') return null;
  answers.bringsFood = body.bringsFood === true;
  if (answers.bringsFood && (typeof body.foodNote !== 'string' || !body.foodNote.trim() || body.foodNote.length > 500)) return null;
  answers.foodNote = answers.bringsFood ? body.foodNote.trim() : '';
  for (const [field, limit] of Object.entries(limits)) {
    if (typeof body[field] !== 'string' || body[field].length > limit) return null;
    answers[field] = body[field].trim();
  }
  return answers.name ? answers : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return admin(request, env);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (url.pathname !== '/api/rsvp') return json({ error: 'Sidan finns inte.' }, 404);
    if (!['GET', 'PUT'].includes(request.method)) return json({ error: 'Metoden stöds inte.' }, 405, { Allow: 'GET, PUT' });
    if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'Öppna formuläret på hemsidan.' }, 403);
    const config = settings(env, url);
    if (!config || !env.DB) return json({ error: 'Anmälan är inte tillgänglig just nu. Försök igen senare.' }, 503);

    try {
      let token = session(request);
      if (request.method === 'GET') {
        token ||= Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
        const row = await env.DB.prepare('SELECT name, attending, companions, needs_bed, bed_stay, comment, phone, brings_food, food_note FROM responses WHERE session_hash = ?1').bind(await hash(token)).first();
        const answers = row ? { name: row.name, interest: Boolean(row.attending), companions: row.companions, bed: Boolean(row.needs_bed), bedStay: row.bed_stay, comment: row.comment, phone: row.phone } : null;
        if (answers) { answers.bringsFood = Boolean(row.brings_food); answers.foodNote = row.food_note; }
        return json({ answers, sitekey: config.sitekey }, 200, { 'Set-Cookie': cookie(token, url) });
      }

      if (request.headers.get('Origin') !== url.origin) return json({ error: 'Öppna formuläret på hemsidan.' }, 403);
      if (!token) return json({ error: 'Tillåt cookies och ladda om sidan innan du skickar.' }, 401);
      if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json({ error: 'Ogiltigt format.' }, 415);
      // Bound streamed bodies as well as requests with a Content-Length header.
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'Svaret saknas.' }, 400);
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16384) { await reader.cancel(); return json({ error: 'Svaret är för långt.' }, 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let body;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ error: 'Ogiltigt format.' }, 400); }
      const answers = validateAnswers(body);
      if (!answers) return json({ error: 'Kontrollera uppgifterna och textlängden.' }, 400);
      if (typeof body.turnstileToken !== 'string' || !body.turnstileToken || body.turnstileToken.length > 2048) return json({ error: 'Säkerhetskontrollen saknas. Försök igen.' }, 400);

      const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: config.secret, response: body.turnstileToken }),
        signal: AbortSignal.timeout(10000),
      });
      if (!verification.ok) return json({ error: 'Säkerhetskontrollen kunde inte nås. Försök igen.' }, 503);
      const result = await verification.json();
      const testing = config.local && config.secret === TEST_SECRET;
      if (!result.success || (!testing && (result.hostname !== url.hostname || result.action !== 'rsvp'))) return json({ error: 'Säkerhetskontrollen misslyckades. Försök igen.' }, 403);

      await env.DB.prepare(`INSERT INTO responses (session_hash, attending, companions, needs_bed, comment, phone, name, bed_stay, brings_food, food_note)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        ON CONFLICT(session_hash) DO UPDATE SET attending = excluded.attending,
          companions = excluded.companions, needs_bed = excluded.needs_bed, bed_stay = excluded.bed_stay,
          comment = excluded.comment, phone = excluded.phone, name = excluded.name,
          brings_food = excluded.brings_food, food_note = excluded.food_note,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`)
        .bind(await hash(token), Number(answers.interest), answers.companions, Number(answers.bed), answers.comment, answers.phone, answers.name, answers.bedStay, Number(answers.bringsFood), answers.foodNote).run();
      return json({ answers, submitted: true });
    } catch {
      return json({ error: 'Svaret kunde inte bekräftas. Försök igen; samma anmälan uppdateras om den redan har sparats.' }, 503);
    }
  },
};
