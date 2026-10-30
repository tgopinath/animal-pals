// Picks one clear, recognisable call per library species and bundles it in audio/calls/.
//   node tools/pick-calls.mjs [key ...]      (needs macOS: uses the built-in sound classifier)
// For each species: gather candidate recordings (iNaturalist + Wikimedia Commons, open licences only),
// score every 1.5 s window with Apple's sound classifier for the expected animal (or, for animals it
// has no label for, for "not people / wind / traffic"), keep the best few seconds of the best file,
// peak-normalise it and save audio/calls/<key>.m4a. Credits go to calls.js.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BEINGS } from '../data.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'audio', 'calls');
const WORK = process.env.CALLS_WORK || path.join(ROOT, '.calls-work');
const JUDGE = process.env.JUDGE || path.join(WORK, 'judge'); // compiled from tools/judge.swift
const UA = { 'User-Agent': 'AnimalPals/1.0 (kids learning app)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(path.join(WORK, 'dl'), { recursive: true });

// Classifier labels that mean "this is the right animal". [] = no label exists; judged on cleanliness.
const LABELS = {
  lion: ['lion_roar'], tiger: ['lion_roar'], elephant: ['trumpet', 'elk_bugle', 'french_horn'], monkey: ['screaming'], wolf: ['dog_howl', 'coyote_howl'],
  bear: ['dog_growl', 'lion_roar'], giraffe: null, zebra: ['horse_neigh'], camel: ['dog_growl', 'lion_roar'], hippo: ['lion_roar', 'dog_growl'], fox: ['dog_bark', 'coyote_howl'],
  squirrel: [], kangaroo: null, panda: null, rhino: null, cheetah: null,
  dog: ['dog_bark', 'dog_bow_wow'], cat: ['cat_meow'], cow: ['cow_moo'], horse: ['horse_neigh'], sheep: ['sheep_bleat'],
  goat: ['sheep_bleat'], pig: ['pig_oink'], donkey: ['horse_neigh', 'elk_bugle'], rabbit: null, chicken: ['rooster_crow'],
  peacock: ['bird_squawk', 'bird_vocalization'], parrot: ['bird_squawk', 'bird_vocalization'], crow: ['crow_caw'], owl: ['owl_hoot'],
  eagle: ['bird_squawk', 'bird_vocalization'], sparrow: ['bird_chirp_tweet'], koel: ['bird_vocalization', 'bird_chirp_tweet'],
  pigeon: ['pigeon_dove_coo'], duck: ['duck_quack'], myna: ['bird_vocalization', 'bird_chirp_tweet'], kingfisher: ['bird_chirp_tweet', 'bird_vocalization'],
  woodpecker: ['bird_vocalization', 'bird_chirp_tweet'], flamingo: ['goose_honk', 'bird_squawk'], stork: [], ostrich: null, penguin: ['bird_squawk', 'bird_vocalization'],
  dolphin: ['whale_vocalization'], whale: ['whale_vocalization'], shark: null, clownfish: null, octopus: null, turtle: null, jellyfish: null,
  crocodile: ['snake_hiss'], cobra: ['snake_hiss'], chameleon: null, gecko: ['frog_croak', 'bird_vocalization'], frog: ['frog_croak', 'frog'],
  bee: ['bee_buzz', 'insect'], butterfly: null, cricket: ['cricket_chirp', 'insect'], ladybug: null,
};
// Extra Commons search words that tend to find clean, typical calls.
const CALLWORD = { lion: 'roar', tiger: 'roar', elephant: 'trumpet', wolf: 'howl', dog: 'bark', cat: 'meow', cow: 'moo', horse: 'neigh', sheep: 'bleat', goat: 'bleat', pig: 'oink', donkey: 'bray', chicken: 'rooster crow', duck: 'quack', owl: 'hoot', crow: 'caw', frog: 'croak', bee: 'buzz', cricket: 'chirp', peacock: 'call', monkey: 'call', hippo: 'call', camel: 'sound', zebra: 'call', bear: 'growl', fox: 'bark', koel: 'call', gecko: 'call', whale: 'song', dolphin: 'whistle' };
const NOISE = new Set('speech shout yell children_shouting laughter baby_laughter belly_laugh baby_crying singing choir_singing breathing cough person_walking chatter crowd music wind wind_rustling_leaves wind_noise_microphone water rain raindrop stream_burbling waterfall sea_waves boat_water_vehicle motorboat_speedboat car_passing_by traffic_noise train airplane engine engine_idling motorcycle click silence'.split(' '));

async function json(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: UA }).catch(() => null);
    const t = r ? await r.text() : '';
    try { return JSON.parse(t); } catch { await sleep(15000 * (i + 1)); }
  }
  throw new Error('rate-limited: ' + url);
}
const sci = {};
async function loadSci() {
  const ids = BEINGS.map(b => b.id);
  for (let i = 0; i < ids.length; i += 30) (await json(`https://api.inaturalist.org/v1/taxa/${ids.slice(i, i + 30).join(',')}`)).results.forEach(t => (sci[t.id] = t.name));
}
async function candidates(b) {
  const out = [];
  const obs = await json(`https://api.inaturalist.org/v1/observations?taxon_id=${b.id}&sounds=true&quality_grade=research&order_by=votes&per_page=12`);
  for (const o of obs.results) for (const s of o.sounds || []) {
    if (!s.file_url || !s.license_code) continue; // open licences only (null = all rights reserved)
    out.push({ src: 'inat', url: s.file_url, by: s.attribution, license: s.license_code.toUpperCase(), page: `https://www.inaturalist.org/observations/${o.id}` });
  }
  await sleep(1200);
  for (const q of [`"${sci[b.id]}"`, `${b.name} ${CALLWORD[b.key] || 'sound'}`]) {
    const r = await json('https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: `filetype:audio ${q}`, gsrnamespace: 6, gsrlimit: 8, prop: 'videoinfo', viprop: 'url|size|mime|derivatives|extmetadata', format: 'json' }));
    for (const p of Object.values(r.query?.pages || {})) {
      const v = p.videoinfo?.[0]; if (!v || v.size > 12e6 || !(v.duration > 1 && v.duration < 240)) continue;
      const mp3 = (v.derivatives || []).find(d => /mp3/.test(d.transcodekey || d.type))?.src;
      const playable = /\.(mp3|wav|flac|m4a)$/i.test(v.url) ? v.url : mp3;
      if (!playable) continue;
      const m = v.extmetadata || {};
      const strip = h => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      out.push({ src: 'commons', url: playable, by: strip(m.Artist?.value) || 'Wikimedia Commons', license: strip(m.LicenseShortName?.value) || 'CC', page: v.descriptionurl, title: p.title });
    }
    await sleep(3000);
  }
  return out.filter((c, i) => out.findIndex(d => d.url === c.url) === i);
}
async function download(url) {
  const f = path.join(WORK, 'dl', Buffer.from(url).toString('base64url').slice(-80) + path.extname(url.split('?')[0]));
  if (fs.existsSync(f) && fs.statSync(f).size > 0) return f;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: UA }).catch(() => null);
    if (r?.ok) { const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 12e6) return null; fs.writeFileSync(f, buf); return f; }
    await sleep(5000);
  }
  return null;
}
// Best stretch of `len` windows: the mean of its windows' scores.
function bestStretch(ws, score, len = 6) {
  let best = { s: -1, t: 0 };
  for (let i = 0; i < ws.length; i++) {
    const part = ws.slice(i, i + len); if (!part.length) break;
    const vals = part.map(score).sort((a, b) => b - a);
    const s = vals.slice(0, Math.max(2, Math.ceil(part.length * .6))).reduce((a, b) => a + b, 0) / Math.max(2, Math.ceil(part.length * .6));
    if (s > best.s) best = { s, t: part[0].t, end: part[part.length - 1].t + 1.5 };
  }
  return best;
}
function judge(file, labels) {
  let r;
  try { r = JSON.parse(execFileSync(JUDGE, ['classify', file, labels.length ? labels.join(',') : 'none'], { encoding: 'utf8', timeout: 60000 })); } catch { return null; }
  const ws = r.windows || []; if (!ws.length) return null;
  const noise = w => Math.max(0, ...w.top.map(x => { const [k, v] = x.split(':'); return NOISE.has(k) ? +v : 0; }));
  const score = labels.length ? (w => w.s - .5 * noise(w)) : (w => 1 - noise(w) - (w.top[0]?.startsWith('silence') ? 1 : 0));
  return { ...bestStretch(ws, score), top: ws.map(w => w.top[0]).filter(Boolean) };
}

const only = process.argv.slice(2);
const credits = fs.existsSync(path.join(ROOT, 'calls.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'calls.json'), 'utf8')) : {};
await loadSci();
for (const b of BEINGS) {
  if (only.length && !only.includes(b.key)) continue;
  const labels = LABELS[b.key];
  if (labels === null) { console.log(`${b.key}: skipped (quiet animal)`); continue; }
  const cands = await candidates(b).catch(e => (console.log(`${b.key}: ${e.message}`), []));
  const scored = [];
  for (const c of cands) {
    const f = await download(c.url); if (!f) continue;
    const j = judge(f, labels); if (!j) continue;
    scored.push({ ...c, file: f, ...j });
  }
  scored.sort((a, b) => b.s - a.s);
  const win = scored[0];
  const min = labels.length ? .35 : .55; // must clearly be the animal (or clearly clean)
  if (!win || win.s < min) { console.log(`${b.key}: no clear call (best ${win ? win.s.toFixed(2) : '-'} of ${scored.length})`); delete credits[b.key]; continue; }
  const dur = Math.min(6, Math.max(2.5, win.end - win.t));
  const caf = path.join(WORK, `${b.key}.caf`), m4a = path.join(OUT, `${b.key}.m4a`);
  try {
    execFileSync(JUDGE, ['export', win.file, String(win.t), String(dur), caf]);
    // Resample to 44.1 kHz: AAC can't encode some recorders' rates (e.g. 96 or 8 kHz).
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac@44100', '-b', '64000', '-c', '1', caf, m4a], { stdio: 'pipe' });
  } catch (e) { console.log(`${b.key}: couldn't convert the clip (${String(e.stderr || e.message).trim().split('\n')[0]})`); continue; }
  credits[b.key] = { by: win.by, license: win.license, page: win.page, score: +win.s.toFixed(2) };
  console.log(`${b.key}: ${win.s.toFixed(2)} from ${win.src} (${scored.length} checked) ${win.t.toFixed(1)}s+${dur.toFixed(1)}s  [${win.top.slice(0, 3).join(' ')}]`);
  fs.writeFileSync(path.join(ROOT, 'calls.json'), JSON.stringify(credits, null, 1));
}
fs.writeFileSync(path.join(ROOT, 'calls.js'), `// Credits for the bundled calls in audio/calls (written by tools/pick-calls.mjs).\nexport const CALLS = ${JSON.stringify(credits, null, 1)};\n`);
console.log('done:', Object.keys(credits).length, 'calls');
