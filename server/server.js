import https from 'node:https';
import { createApp } from './app.js';
import { getServerConfig } from './config.js';
import { createHttpServer } from './http-server.js';
import { createRecorderRegistry } from './services/recorder-registry.js';
import { createRecordingStore } from './services/recording-store.js';
import { attachSocketServer } from './ws/socket-server.js';

const config = getServerConfig();
const recorderRegistry = createRecorderRegistry();
const recordingStore = createRecordingStore({ recordingsDir: config.recordingsDir });
const app = await createApp({
  recordingStore,
  recorderRegistry,
  distDir: config.distDir,
});
const server = await createHttpServer(app);

attachSocketServer(server, recorderRegistry);

server.listen(config.port, config.host, () => {
  const proto = server instanceof https.Server ? 'https' : 'http';
  console.log(`Cat recorder server listening on ${proto}://${config.host}:${config.port}`);
});
