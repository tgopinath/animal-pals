// Relays iNaturalist field recordings with CORS headers, so the app can measure and boost quiet ones.
// GET /api/sound?u=<https://static.inaturalist.org/sounds/...>
export const config = { runtime: 'edge' };

const ALLOWED = new Set(['static.inaturalist.org', 'inaturalist-open-data.s3.amazonaws.com']);
const MAX_BYTES = 15 * 1024 * 1024;

export default async function handler(req) {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  let target;
  try { target = new URL(new URL(req.url).searchParams.get('u') || ''); } catch { return new Response('Bad url', { status: 400, headers: cors }); }
  if (target.protocol !== 'https:' || !ALLOWED.has(target.hostname)) return new Response('Not allowed', { status: 403, headers: cors });
  const r = await fetch(target, { headers: { 'User-Agent': 'AnimalPals/1.0 (kids learning app)' } });
  if (!r.ok) return new Response('Upstream error', { status: 502, headers: cors });
  const len = +r.headers.get('content-length') || 0;
  if (len > MAX_BYTES) return new Response('Too large', { status: 413, headers: cors });
  return new Response(r.body, {
    headers: {
      ...cors,
      'Content-Type': r.headers.get('content-type') || 'audio/mpeg',
      'Cache-Control': 'public, max-age=604800, s-maxage=2592000, immutable',
    },
  });
}
