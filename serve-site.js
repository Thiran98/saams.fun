// Local preview of saams.fun: the front page from site/, the game from client/ at /game/ (and /practice/).
const http = require('http'), fs = require('fs'), path = require('path');
const SITE = 'D:/IELTS Gym/village-mafia/site', GAME = 'D:/IELTS Gym/village-mafia/client';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  let root = SITE;
  const m = u.match(/^\/(game|practice|play)(\/.*)?$/);
  if (m) { root = GAME; u = m[2] || '/'; }
  if (u.endsWith('/')) u += 'index.html';
  const file = path.normalize(path.join(root, u));
  if (!file.startsWith(path.normalize(root))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(5190, () => console.log('saams.fun preview on http://localhost:5190'));
