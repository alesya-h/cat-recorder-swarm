import { WebSocketServer } from 'ws';
import { SOCKET_MESSAGE_TYPES } from '../../shared/protocol/messages.js';

export function attachSocketServer(server, recorderRegistry) {
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
    const client = recorderRegistry.addClient(socket);

    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(String(raw));
        handleSocketMessage(client, message, recorderRegistry);
      } catch (_error) {
        socket.send(JSON.stringify({ type: SOCKET_MESSAGE_TYPES.ERROR, error: 'Invalid JSON' }));
      }
    });

    socket.on('close', () => {
      recorderRegistry.removeClient(socket);
      recorderRegistry.broadcastRecorderSnapshot();
    });
  });
}

function handleSocketMessage(client, message, recorderRegistry) {
  if (message.type === SOCKET_MESSAGE_TYPES.HELLO) {
    recorderRegistry.applyHello(client, message);
    if (client.role === 'controller') {
      recorderRegistry.sendRecorderSnapshot(client.socket);
    }
    return;
  }

  if (message.type === SOCKET_MESSAGE_TYPES.RECORDER_STATUS) {
    recorderRegistry.applyRecorderStatus(client, message);
    recorderRegistry.broadcastRecorderSnapshot();
  }
}
