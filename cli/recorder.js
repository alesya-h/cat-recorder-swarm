#!/usr/bin/env node

import process from 'node:process';
import { createRecorderClient } from '../shared/recorder-client.js';
import { listNodeInputs, startNodeInput } from './node-inputs.js';

const [, , backendUrl, deviceName] = process.argv;

if (!backendUrl || !deviceName) {
  console.error('Usage: node cli/recorder.js <backend-url> <device-name>');
  process.exit(1);
}

const nodeInputs = await listNodeInputs();

if (nodeInputs.length === 0) {
  console.error('No audio input devices found');
  process.exit(1);
}

const selectedInputs = nodeInputs.map((input, index, all) => ({
  ...input,
  inputName: all.length > 1 ? input.label : '',
}));

const recorderClient = createRecorderClient({
  backendUrl,
  deviceName,
  clientType: 'cli',
  startInput: startNodeInput,
  onState: (state) => {
    const status = state.connected ? 'connected' : 'disconnected';
    const inputs = state.activeInputs.map((input) => input.inputName || input.label).join(', ');
    console.log(`[state] ${status} :: ${inputs || 'waiting for input'}`);
  },
  onLog: (message) => {
    console.log(`[recorder] ${message}`);
  },
});

recorderClient.connect();
await recorderClient.start(selectedInputs);

process.on('SIGINT', async () => {
  await recorderClient.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await recorderClient.destroy();
  process.exit(0);
});
