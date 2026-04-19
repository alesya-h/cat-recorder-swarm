import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import express from 'express';
import { WebSocketServer } from 'ws';
import { loadOrCreateAutoHttpsCertificate } from './auto-https.js';

const app = express();
const port = Number(process.env.PORT || 3001);
const recordingsDir = path.resolve(process.cwd(), process.env.RECORDINGS_DIR || 'recordings');
const distDir = path.resolve(process.cwd(), 'dist');

const clients = new Map();

app.use((request, response, next) => {
  response.header('Access-Control-Allow-Origin', request.headers.origin || '*');
  response.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.header('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') {
    response.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.post('/api/capture-requests', async (request, response) => {
  const durationSeconds = Number(request.body?.durationSeconds || 0);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    response.status(400).json({ error: 'durationSeconds must be a positive number' });
    return;
  }

  const controllerTimestamp = Date.now();
  const folder = path.join(recordingsDir, String(controllerTimestamp));
  await fs.mkdir(folder, { recursive: true });

  const requestDetails = {
    controllerTimestamp,
    durationSeconds,
    createdAtIso: new Date(controllerTimestamp).toISOString(),
  };

  await fs.writeFile(path.join(folder, 'request.json'), JSON.stringify(requestDetails, null, 2));

  broadcastToRecorders({
    type: 'capture_request',
    controllerTimestamp,
    durationSeconds,
  });

  response.json({ controllerTimestamp });
});

app.post('/api/transcriptions', async (request, response) => {
  const controllerTimestamp = String(request.body?.controllerTimestamp || '').trim();
  const transcription = typeof request.body?.transcription === 'string' ? request.body.transcription : '';

  if (!controllerTimestamp) {
    response.status(400).json({ error: 'controllerTimestamp is required' });
    return;
  }

  const folder = path.join(recordingsDir, controllerTimestamp);
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'transcription.txt'), transcription, 'utf8');
  response.json({ ok: true });
});

app.post('/api/clips', express.raw({ type: 'application/octet-stream', limit: '200mb' }), async (request, response) => {
  const controllerTimestamp = String(request.query.controllerTimestamp || '').trim();
  const deviceName = String(request.query.deviceName || '').trim();
  const inputName = String(request.query.inputName || '').trim();
  const fromEpochMs = String(request.query.fromEpochMs || '').trim();
  const toEpochMs = String(request.query.toEpochMs || '').trim();
  const format = String(request.query.format || 'wav').trim().toLowerCase();

  if (!controllerTimestamp || !deviceName || !fromEpochMs || !toEpochMs || !request.body?.length) {
    response.status(400).json({ error: 'Missing clip metadata or payload' });
    return;
  }

  const safeDevice = sanitizeName(deviceName);
  const safeInput = sanitizeName(inputName);
  const safeExtension = format === 'flac' ? 'flac' : 'wav';
  const fileName = safeInput
    ? `${safeDevice}_${safeInput}_${fromEpochMs}_${toEpochMs}.${safeExtension}`
    : `${safeDevice}_${fromEpochMs}_${toEpochMs}.${safeExtension}`;

  const folder = path.join(recordingsDir, controllerTimestamp);
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, fileName), request.body);
  response.json({ ok: true });
});

if (await directoryExists(distDir)) {
  app.use(express.static(distDir));
  app.get('*', async (_request, response, next) => {
    try {
      response.sendFile(path.join(distDir, 'index.html'));
    } catch (error) {
      next(error);
    }
  });
}

const server = await createHttpServer(app);

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/ws') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws);
  });
});

wss.on('connection', (socket) => {
  const client = {
    socket,
    role: 'unknown',
    clientType: 'unknown',
    deviceName: '',
    battery: null,
    inputs: [],
    connectedAt: Date.now(),
  };

  clients.set(socket, client);

  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(String(raw));
      handleSocketMessage(client, message);
    } catch (_error) {
      socket.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
    }
  });

  socket.on('close', () => {
    clients.delete(socket);
    broadcastRecorderSnapshot();
  });
});

server.listen(port, '0.0.0.0', () => {
  const proto = server instanceof https.Server ? 'https' : 'http';
  console.log(`Cat recorder server listening on ${proto}://0.0.0.0:${port}`);
});

function handleSocketMessage(client, message) {
  if (message.type === 'hello') {
    client.role = message.role || 'unknown';
    client.clientType = message.clientType || 'unknown';
    if (client.role === 'controller') {
      sendRecorderSnapshot(client.socket);
    }
    return;
  }

  if (message.type === 'recorder_status') {
    client.role = 'recorder';
    client.clientType = message.clientType || client.clientType;
    client.deviceName = String(message.deviceName || '').trim();
    client.battery = message.battery || null;
    client.inputs = Array.isArray(message.inputs) ? message.inputs : [];
    broadcastRecorderSnapshot();
  }
}

function broadcastToRecorders(payload) {
  const body = JSON.stringify(payload);
  for (const client of clients.values()) {
    if (client.role === 'recorder' && client.socket.readyState === 1) {
      client.socket.send(body);
    }
  }
}

function broadcastRecorderSnapshot() {
  const payload = JSON.stringify({
    type: 'recorder_snapshot',
    recorders: getRecorderSnapshot(),
  });

  for (const client of clients.values()) {
    if (client.role === 'controller' && client.socket.readyState === 1) {
      client.socket.send(payload);
    }
  }
}

function sendRecorderSnapshot(socket) {
  socket.send(JSON.stringify({
    type: 'recorder_snapshot',
    recorders: getRecorderSnapshot(),
  }));
}

function getRecorderSnapshot() {
  return Array.from(clients.values())
    .filter((client) => client.role === 'recorder' && client.deviceName)
    .map((client) => ({
      deviceName: client.deviceName,
      clientType: client.clientType,
      battery: client.battery,
      inputs: client.inputs,
      connectedAt: client.connectedAt,
    }))
    .sort((left, right) => left.deviceName.localeCompare(right.deviceName));
}

function sanitizeName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'unnamed';
}

async function directoryExists(target) {
  try {
    const stat = await fs.stat(target);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function createHttpServer(expressApp) {
  if (process.env.HTTP_ONLY === '1') {
    return http.createServer(expressApp);
  }

  const certFile = process.env.HTTPS_CERT_FILE;
  const keyFile = process.env.HTTPS_KEY_FILE;

  if (certFile && keyFile) {
    const [cert, key] = await Promise.all([
      fs.readFile(path.resolve(certFile)),
      fs.readFile(path.resolve(keyFile)),
    ]);

    return https.createServer({ cert, key }, expressApp);
  }

  if (process.env.AUTO_HTTPS === '1') {
    const certificate = await loadOrCreateAutoHttpsCertificate();
    const mode = certificate.generated ? 'generated' : 'reused';
    console.log(`Using ${mode} self-signed HTTPS certificate for: ${certificate.hosts.join(', ')}`);
    return https.createServer({ cert: certificate.cert, key: certificate.key }, expressApp);
  }

  return http.createServer(expressApp);
}
