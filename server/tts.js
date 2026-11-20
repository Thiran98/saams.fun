// The narrator's voice with OpenAI (text to speech), used by Classic Mafia mode.
// - The OpenAI key is read on the server only (OPENAI_API_KEY, from the environment or server/.env). It is never
//   sent to the browser.
// - The server only speaks lines it wrote itself (remember()); a browser asks for a line by its id, so nobody can
//   use the key to say anything else.
// - Every line is made once per voice and saved in server/tts-cache/, so repeated lines cost nothing.
// - TTS_MAX_PER_DAY (default 400) caps how many new lines are made per day.
// Without a key, /tts-status says "off" and the browsers use their own voice.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.TTS_MODEL || 'gpt-4o-mini-tts';
const MAX_PER_DAY = Number(process.env.TTS_MAX_PER_DAY) || 400;
const VOICES = ['ballad', 'onyx', 'ash', 'coral', 'echo', 'fable', 'nova', 'sage', 'shimmer', 'verse', 'alloy'];
const INSTRUCTIONS = 'You are the narrator of a mystery game set in a Sri Lankan village. Speak like a warm, dramatic ' +
  'storyteller around a fire at night: slow, clear, with suspense, and a light Sri Lankan English accent.';
const CACHE = path.join(__dirname, 'tts-cache');

const lines = new Map([['sample', 'Welcome to Berala Panathara. I am your narrator tonight.']]);
const making = new Map();
let day = '', made = 0;

// A line the game wrote: returns its id
function remember(text) {
  const id = crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
  lines.set(id, text);
  if (lines.size > 2000) lines.delete(lines.keys().next().value);
  return id;
}

async function make(id, voice, file) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; made = 0; }
  if (made >= MAX_PER_DAY) throw new Error('daily limit reached');
  made++;
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, voice, input: lines.get(id), instructions: INSTRUCTIONS, response_format: 'mp3' }),
  });
  if (!res.ok) throw new Error('OpenAI ' + res.status + ': ' + (await res.text()).slice(0, 200));
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

function routes(app) {
  app.get('/tts-status', (req, res) => res.set('Cache-Control', 'no-store').json({ on: !!KEY }));
  app.get('/tts', async (req, res) => {
    const id = String(req.query.id || '');
    const voice = VOICES.includes(req.query.voice) ? req.query.voice : 'ballad';
    if (!KEY || !lines.has(id) || !/^[a-z0-9]+$/.test(id)) return res.status(404).end();
    const file = path.join(CACHE, id + '-' + voice + '.mp3');
    try {
      if (!fs.existsSync(file)) {
        const k = id + voice;
        if (!making.has(k)) making.set(k, make(id, voice, file).finally(() => making.delete(k)));
        await making.get(k);
      }
      res.set('Cache-Control', 'public, max-age=86400').type('audio/mpeg').sendFile(file);
    } catch (e) {
      console.log('Narrator voice failed: ' + e.message);
      res.status(503).end();
    }
  });
}

module.exports = { remember, routes, on: !!KEY };
