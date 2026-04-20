import { useEffect, useState } from 'react';
import { RECONNECT_DELAY_MS } from '../../../shared/constants.js';
import { createBackendUrls } from '../../../shared/net.js';
import { SOCKET_MESSAGE_TYPES } from '../../../shared/protocol/messages.js';
import { requestCapture, submitTranscription } from './controller-api.js';

function makeInitialControllerState() {
  return {
    connected: false,
    recorders: [],
    busy: false,
    lastControllerTimestamp: null,
  };
}

export function useControllerConnection({ backendUrl, setError }) {
  const [controller, setController] = useState(makeInitialControllerState);

  useEffect(() => {
    let socket = null;
    let reconnectTimer = null;
    let disposed = false;
    const urls = createBackendUrls(backendUrl);

    setController((current) => ({
      ...current,
      connected: false,
      recorders: [],
    }));

    const connect = () => {
      if (disposed) {
        return;
      }

      socket = new WebSocket(urls.wsUrl);

      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({
          type: SOCKET_MESSAGE_TYPES.HELLO,
          role: 'controller',
          clientType: 'web',
        }));

        setError((current) => (current === 'Controller connection failed' ? '' : current));
        setController((current) => ({ ...current, connected: true }));
      });

      socket.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === SOCKET_MESSAGE_TYPES.RECORDER_SNAPSHOT) {
            setController((current) => ({
              ...current,
              recorders: Array.isArray(message.recorders) ? message.recorders : [],
            }));
          }
        } catch (_error) {
          setError('Bad controller socket message');
        }
      });

      socket.addEventListener('close', () => {
        socket = null;
        setController((current) => ({ ...current, connected: false }));

        if (!disposed) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      });

      socket.addEventListener('error', () => {
        setError('Controller connection failed');
        if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      });
    };

    connect();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [backendUrl, setError]);

  async function sendCapture(durationSeconds) {
    setError('');
    setController((current) => ({ ...current, busy: true }));

    try {
      const body = await requestCapture(backendUrl, durationSeconds);
      const controllerTimestamp = body.controllerTimestamp;

      setController((current) => ({
        ...current,
        busy: false,
        lastControllerTimestamp: controllerTimestamp,
      }));

      const transcription = window.prompt('Optional transcription for this cat sound:');
      if (transcription !== null) {
        await submitTranscription(backendUrl, controllerTimestamp, transcription);
      }
    } catch (error) {
      setError(String(error?.message || error));
      setController((current) => ({ ...current, busy: false }));
    }
  }

  return {
    controller,
    sendCapture,
  };
}
