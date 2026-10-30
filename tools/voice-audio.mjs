// Renders voice clips for the library species with macOS voices: English (Samantha) and Tamil (Vani).
// Recorded clips play as normal audio, so they work on every phone: with no Tamil voice installed,
// and on iPhones where the silent switch or Safari's speech quirks would mute the browser's own voice.
//   node tools/voice-audio.mjs          only renders missing or changed clips
// Output: audio/<en|ta>/<key>-name.m4a (the name) and audio/<en|ta>/<key>-about.m4a (name, explanation, fun fact).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { TA } from '../data-ta.js';
import { BEINGS } from '../data.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const AUDIO = path.join(ROOT, 'audio');
const STAMP = path.join(AUDIO, '.hashes.json');
const tmp = fs.mkdtempSync(path.join(ROOT, '.tts-'));
const seen = (() => { try { return JSON.parse(fs.readFileSync(STAMP, 'utf8')); } catch { return {}; } })();
for (const l of ['en', 'ta']) fs.mkdirSync(path.join(AUDIO, l), { recursive: true });

// Names are spoken slower so little ones can repeat them.
const clips = [
  ...BEINGS.flatMap(b => [
    { file: `en/${b.key}-name`, voice: 'Samantha', rate: 140, text: `${b.name}.` },
    { file: `en/${b.key}-about`, voice: 'Samantha', rate: 170, text: `${b.name}. ${b.bio} Did you know? ${b.fun}` },
  ]),
  ...Object.entries(TA).flatMap(([key, t]) => [
    { file: `ta/${key}-name`, voice: 'Vani', rate: 115, text: `${t.n}.` },
    { file: `ta/${key}-about`, voice: 'Vani', rate: 150, text: `${t.n}. ${t.bio} தெரியுமா? ${t.fun}` },
  ]),
];
let made = 0;
try {
  for (const c of clips) {
    const hash = crypto.createHash('sha1').update(`${c.voice}|${c.rate}|${c.text}`).digest('hex');
    const dst = path.join(AUDIO, `${c.file}.m4a`);
    if (seen[c.file] === hash && fs.existsSync(dst)) continue;
    const aiff = path.join(tmp, `${c.file.replace('/', '-')}.aiff`);
    execFileSync('say', ['-v', c.voice, '-r', String(c.rate), '-o', aiff, c.text]);
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '40000', '-c', '1', aiff, dst]);
    seen[c.file] = hash; made++;
  }
  fs.writeFileSync(STAMP, JSON.stringify(seen, null, 1));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`rendered ${made} clip(s); ${clips.length} total in audio/`);
