import { RECONNECT_DELAY_MS } from './constants.js';
import { LoopedAudioBuffer } from './audio/looped-audio-buffer.js';
import { encodeWav } from './audio/wav.js';
import { createBackendUrls } from './net.js';

export function createRecorderClient({ backendUrl, deviceName, clientType, startInput, onState, onLog }) {
  const urls = createBackendUrls(backendUrl);
  const sessions = new Map();
  let socket = null;
  let reconnectTimer = null;
  let closed = false;
  let battery = null;
  let currentDeviceName = deviceName;

  function log(message) {
    onLog?.(message);
  }

  function emitState() {
    onState?.({
      connected: socket?.readyState === WebSocket.OPEN,
      deviceName: currentDeviceName,
      battery,
      activeInputs: Array.from(sessions.values()).map((session) => ({
        id: session.id,
        label: session.label,
        inputName: session.inputName,
        active: session.active,
        sampleRate: session.sampleRate,
        channelCount: session.channelCount,
        lastError: session.lastError,
      })),
    });
  }

  function sendMessage(type, payload = {}) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, ...payload }));
    }
  }

  function publishStatus() {
    sendMessage('recorder_status', {
      clientType,
      deviceName: currentDeviceName,
      battery,
      inputs: Array.from(sessions.values()).map((session) => ({
        id: session.id,
        label: session.label,
        inputName: session.inputName,
        active: session.active,
        sampleRate: session.sampleRate,
        channelCount: session.channelCount,
        lastError: session.lastError,
      })),
    });
  }

  function scheduleReconnect() {
    if (closed || reconnectTimer) {
      return;
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_DELAY_MS);
  }

  function handleSocketMessage(message) {
    if (message.type === 'capture_request') {
      void handleCaptureRequest(message);
    }
  }

  async function handleCaptureRequest({ controllerTimestamp, durationSeconds }) {
    const uploads = Array.from(sessions.values()).map((session) => uploadClipForSession(session, controllerTimestamp, durationSeconds));
    await Promise.allSettled(uploads);
  }

  async function uploadClipForSession(session, controllerTimestamp, durationSeconds) {
    if (!session.buffer) {
      log(`Input ${session.inputName || session.label} has no audio yet`);
      return;
    }

    const clip = session.buffer.extractLast(durationSeconds);
    if (!clip) {
      log(`Input ${session.inputName || session.label} buffer is empty`);
      return;
    }

    const wav = encodeWav({ sampleRate: clip.sampleRate, channelData: clip.channelData });
    const params = new URLSearchParams({
      controllerTimestamp: String(controllerTimestamp),
      deviceName: currentDeviceName,
      inputName: session.inputName || '',
      fromEpochMs: String(clip.fromEpochMs),
      toEpochMs: String(clip.toEpochMs),
      format: 'wav',
    });

    const response = await fetch(`${urls.clipsUrl}?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: wav,
    });

    if (!response.ok) {
      throw new Error(`Clip upload failed with ${response.status}`);
    }

    log(`Uploaded ${session.inputName || session.label} for request ${controllerTimestamp}`);
  }

  function connect() {
    if (closed) {
      return;
    }

    socket = new WebSocket(urls.wsUrl);

    socket.addEventListener('open', () => {
      sendMessage('hello', { role: 'recorder', clientType });
      publishStatus();
      emitState();
      log('Recorder connected');
    });

    socket.addEventListener('message', (event) => {
      try {
        handleSocketMessage(JSON.parse(event.data));
      } catch (error) {
        log(`Bad socket message: ${String(error)}`);
      }
    });

    socket.addEventListener('close', () => {
      emitState();
      log('Recorder disconnected');
      scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      log('Recorder socket error');
    });
  }

  async function start(selectedInputs) {
    await stop();

    for (const input of selectedInputs) {
      const session = {
        id: input.id,
        label: input.label,
        inputName: input.inputName,
        active: false,
        sampleRate: null,
        channelCount: null,
        buffer: null,
        stop: null,
        lastError: null,
      };

      sessions.set(session.id, session);

      try {
        const controller = await startInput({
          input,
          onChunk: ({ sampleRate, channelData, captureEndEpochMs }) => {
            if (!session.buffer) {
              session.sampleRate = sampleRate;
              session.channelCount = channelData.length;
              session.buffer = new LoopedAudioBuffer({
                sampleRate,
                channelCount: channelData.length,
              });
              publishStatus();
              emitState();
            }

            session.buffer.append(channelData, captureEndEpochMs);
          },
          onError: (error) => {
            session.lastError = String(error?.message || error);
            publishStatus();
            emitState();
            log(`Input ${session.inputName || session.label} failed: ${session.lastError}`);
          },
        });

        session.stop = controller?.stop || null;
        session.active = true;
        publishStatus();
        emitState();
        log(`Recording ${session.inputName || session.label}`);
      } catch (error) {
        session.lastError = String(error?.message || error);
        log(`Could not start ${session.inputName || session.label}: ${session.lastError}`);
      }
    }

    if (!socket || socket.readyState === WebSocket.CLOSED) {
      connect();
    }

    publishStatus();
    emitState();
  }

  async function stop() {
    const stops = Array.from(sessions.values()).map(async (session) => {
      try {
        await session.stop?.();
      } catch (error) {
        log(`Error stopping ${session.inputName || session.label}: ${String(error)}`);
      }
    });

    await Promise.allSettled(stops);
    sessions.clear();
    publishStatus();
    emitState();
  }

  async function destroy() {
    closed = true;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    await stop();
    socket?.close();
  }

  return {
    connect,
    start,
    stop,
    destroy,
    setBattery(nextBattery) {
      battery = nextBattery;
      publishStatus();
      emitState();
    },
    setDeviceName(nextDeviceName) {
      currentDeviceName = nextDeviceName;
      publishStatus();
      emitState();
    },
  };
}
