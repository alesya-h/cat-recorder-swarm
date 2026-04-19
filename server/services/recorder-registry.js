import { SOCKET_MESSAGE_TYPES } from '../../shared/protocol/messages.js';

export function createRecorderRegistry() {
  const clients = new Map();

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

  return {
    addClient(socket) {
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
      return client;
    },

    removeClient(socket) {
      clients.delete(socket);
    },

    applyHello(client, message) {
      client.role = message.role || 'unknown';
      client.clientType = message.clientType || 'unknown';
    },

    applyRecorderStatus(client, message) {
      client.role = 'recorder';
      client.clientType = message.clientType || client.clientType;
      client.deviceName = String(message.deviceName || '').trim();
      client.battery = message.battery || null;
      client.inputs = Array.isArray(message.inputs) ? message.inputs : [];
    },

    broadcastToRecorders(payload) {
      const body = JSON.stringify(payload);
      for (const client of clients.values()) {
        if (client.role === 'recorder' && client.socket.readyState === 1) {
          client.socket.send(body);
        }
      }
    },

    broadcastRecorderSnapshot() {
      const payload = JSON.stringify({
        type: SOCKET_MESSAGE_TYPES.RECORDER_SNAPSHOT,
        recorders: getRecorderSnapshot(),
      });

      for (const client of clients.values()) {
        if (client.role === 'controller' && client.socket.readyState === 1) {
          client.socket.send(payload);
        }
      }
    },

    sendRecorderSnapshot(socket) {
      socket.send(JSON.stringify({
        type: SOCKET_MESSAGE_TYPES.RECORDER_SNAPSHOT,
        recorders: getRecorderSnapshot(),
      }));
    },
  };
}
