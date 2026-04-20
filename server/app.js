import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { registerApiRoutes } from './routes/api.js';

export async function createApp({ recordingStore, recorderRegistry, distDir, recordingsDir }) {
  const app = express();

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
  registerApiRoutes(app, { recordingStore, recorderRegistry });
  app.use('/recordings-files', express.static(recordingsDir));

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

  return app;
}

async function directoryExists(target) {
  try {
    const stat = await fs.stat(target);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
