// MIDItest desktop shell: serves the static app from a local HTTP server (secure context for Web MIDI)
// and grants MIDI / audio permissions so device tests run without browser prompts.
const {app, BrowserWindow, session, shell} = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml'};

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
      if (!file.startsWith(ROOT) || file.includes(path.sep + 'node_modules' + path.sep)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

const ALLOWED = new Set(['midi', 'midiSysex', 'media', 'speaker-selection', 'clipboard-sanitized-write', 'fileSystem']);

app.whenReady().then(async () => {
  const port = await serve();
  const origin = `http://127.0.0.1:${port}`;
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => cb(ALLOWED.has(perm) && (details.requestingUrl || '').startsWith(origin)));
  session.defaultSession.setPermissionCheckHandler((wc, perm, requestingOrigin) => ALLOWED.has(perm) && requestingOrigin.startsWith(origin));
  const win = new BrowserWindow({width: 1400, height: 900, backgroundColor: '#070b10', title: 'MIDItest', autoHideMenuBar: true,
    webPreferences: {contextIsolation: true, nodeIntegration: false, sandbox: true}});
  win.webContents.setWindowOpenHandler(({url}) => { if (/^https?:/.test(url)) shell.openExternal(url); return {action: 'deny'}; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(origin)) { e.preventDefault(); shell.openExternal(url); } });
  win.loadURL(origin + '/index.html');
});

app.on('window-all-closed', () => app.quit());
