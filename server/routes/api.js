import express from 'express';
import { SOCKET_MESSAGE_TYPES } from '../../shared/protocol/messages.js';

export function registerApiRoutes(app, { recordingStore, recorderRegistry }) {
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
    await recordingStore.writeCaptureRequest({ controllerTimestamp, durationSeconds });
    recorderRegistry.broadcastToRecorders({
      type: SOCKET_MESSAGE_TYPES.CAPTURE_REQUEST,
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

    await recordingStore.writeTranscription({ controllerTimestamp, transcription });
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

    await recordingStore.writeClip({
      controllerTimestamp,
      deviceName,
      inputName,
      fromEpochMs,
      toEpochMs,
      format,
      bytes: request.body,
    });

    response.json({ ok: true });
  });
}
