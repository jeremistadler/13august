// Enkel webbserver utan beroenden.
// Serverar statiska filer från ../frontend och API-endpoints under /api/.
// Start: node api/server.js  (PORT kan sättas via miljövariabel, standard 3000)

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ics': 'text/calendar; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function send(res, status, body, headers) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendNotFound(res) {
  fs.readFile(path.join(FRONTEND_DIR, '404.html'), (err, data) => {
    if (err) {
      send(res, 404, 'Sidan kunde inte hittas', { 'Content-Type': 'text/plain; charset=utf-8' });
    } else {
      send(res, 404, data, { 'Content-Type': 'text/html; charset=utf-8' });
    }
  });
}

function handleApi(req, res, pathname) {
  if (pathname === '/api/health') {
    send(res, 200, JSON.stringify({ status: 'ok' }), { 'Content-Type': 'application/json; charset=utf-8' });
    return;
  }
  send(res, 404, JSON.stringify({ error: 'Okänd endpoint' }), { 'Content-Type': 'application/json; charset=utf-8' });
}

function serveStatic(req, res, pathname) {
  let filePath = path.normalize(path.join(FRONTEND_DIR, decodeURIComponent(pathname)));

  // Förhindra path traversal utanför frontend-mappen
  if (!filePath.startsWith(FRONTEND_DIR + path.sep) && filePath !== FRONTEND_DIR) {
    sendNotFound(res);
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) {
      // Katalog utan avslutande snedstreck: omdirigera så att relativa
      // sökvägar i sidan fungerar (t.ex. /wedding -> /wedding/)
      if (!pathname.endsWith('/')) {
        send(res, 301, null, { Location: pathname + '/' });
        return;
      }
      filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        sendNotFound(res);
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      send(res, 200, data, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      });
    });
  });
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname);
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Servern körs på http://localhost:${PORT}`);
});
