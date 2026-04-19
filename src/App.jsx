import { useEffect, useRef, useState } from 'react';
import { CAPTURE_PRESETS } from '../shared/constants.js';
import { createBackendUrls, normalizeBackendUrl } from '../shared/net.js';
import { createRecorderClient } from '../shared/recorder-client.js';
import { loadBrowserAudioInputs, startBrowserInput } from './audio/browser-inputs.js';

const DEVICE_NAME_STORAGE_KEY = 'cat-recorder-device-name';

function makeInitialState() {
  const backendUrl = normalizeBackendUrl();
  const deviceName = getInitialDeviceName();

  return {
    backendUrl,
    role: null,
    error: '',
    controller: {
      connected: false,
      recorders: [],
      busy: false,
      lastControllerTimestamp: null,
    },
    recorder: {
      deviceName,
      loadingInputs: false,
      autoRecordEnabled: true,
      availableInputs: [],
      selectedInputIds: [],
      inputAliases: {},
      inputGainEnabled: {},
      inputGains: {},
      connected: false,
      running: false,
      activeInputs: [],
      battery: null,
      logs: [],
    },
  };
}

export default function App() {
  const [state, setState] = useState(makeInitialState);
  const recorderClientRef = useRef(null);
  const recorderStartingRef = useRef(false);
  const controllerSocketRef = useRef(null);
  const controllerReconnectRef = useRef(null);
  const batteryCleanupRef = useRef(null);
  const wakeLockRef = useRef(null);

  useEffect(() => {
    return () => {
      void destroyRecorderRuntime(recorderClientRef, batteryCleanupRef, wakeLockRef);
      cleanupControllerSocket(controllerSocketRef, controllerReconnectRef);
    };
  }, []);

  useEffect(() => {
    if (state.role !== 'recorder' || !state.recorder.autoRecordEnabled) {
      return;
    }

    if (state.recorder.availableInputs.length === 0 || state.recorder.running || recorderStartingRef.current) {
      return;
    }

    recorderStartingRef.current = true;
    void startRecorderMode().finally(() => {
      recorderStartingRef.current = false;
    });
  }, [state.role, state.recorder.autoRecordEnabled, state.recorder.availableInputs, state.recorder.running]);

  async function loadInputs() {
    setState((current) => ({
      ...current,
      error: '',
      recorder: { ...current.recorder, loadingInputs: true },
    }));

    try {
      const availableInputs = await loadBrowserAudioInputs();
      const selectedInputIds = availableInputs.map((input) => input.id);

      setState((current) => ({
        ...current,
        recorder: {
          ...current.recorder,
          autoRecordEnabled: true,
          loadingInputs: false,
          availableInputs,
          selectedInputIds,
        },
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: String(error?.message || error),
        recorder: { ...current.recorder, loadingInputs: false },
      }));
    }
  }

  function connectControllerMode() {
    if (
      controllerSocketRef.current
      && (controllerSocketRef.current.readyState === WebSocket.OPEN || controllerSocketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    cleanupControllerSocket(controllerSocketRef, controllerReconnectRef);
    const urls = createBackendUrls(state.backendUrl);
    const socket = new WebSocket(urls.wsUrl);
    controllerSocketRef.current = socket;

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'hello', role: 'controller', clientType: 'web' }));
      setState((current) => ({
        ...current,
        controller: { ...current.controller, connected: true },
      }));
    });

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'recorder_snapshot') {
          setState((current) => ({
            ...current,
            controller: {
              ...current.controller,
              recorders: Array.isArray(message.recorders) ? message.recorders : [],
            },
          }));
        }
      } catch (_error) {
        setState((current) => ({ ...current, error: 'Bad controller socket message' }));
      }
    });

    socket.addEventListener('close', () => {
      if (controllerSocketRef.current === socket) {
        controllerSocketRef.current = null;
      }

      setState((current) => ({
        ...current,
        controller: { ...current.controller, connected: false },
      }));

      controllerReconnectRef.current = setTimeout(() => {
        if (controllerSocketRef.current === socket) {
          connectControllerMode();
        }
      }, 1500);
    });

    socket.addEventListener('error', () => {
      setState((current) => ({ ...current, error: 'Controller connection failed' }));
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    });
  }

  async function startRecorderMode(recorderState = state.recorder) {
    const effectiveDeviceName = recorderState.deviceName.trim() || 'web-recorder';
    let availableInputs = recorderState.availableInputs;
    if (availableInputs.length === 0) {
      try {
        availableInputs = await loadBrowserAudioInputs();
      } catch (error) {
        setState((current) => ({ ...current, error: String(error?.message || error) }));
        return;
      }
    }

    const selectedInputIds = recorderState.selectedInputIds.length > 0
      ? recorderState.selectedInputIds
      : availableInputs.map((input) => input.id);

    const selectedInputs = availableInputs
      .filter((input) => selectedInputIds.includes(input.id))
      .map((input, index, items) => ({
        ...input,
        gain: recorderState.inputGainEnabled[input.id] ? gainFromDb(getInputGainDb(recorderState.inputGains[input.id])) : 1,
        inputName: buildInputName(input, recorderState.inputAliases[input.id], items.length),
      }));

    if (selectedInputs.length === 0) {
      setState((current) => ({ ...current, error: 'Select at least one audio input' }));
      return;
    }

    await destroyRecorderRuntime(recorderClientRef, batteryCleanupRef, wakeLockRef);

    const recorderClient = createRecorderClient({
      backendUrl: state.backendUrl,
      deviceName: effectiveDeviceName,
      clientType: 'web',
      preferredFormat: 'wav',
      startInput: startBrowserInput,
      onState: (runtimeState) => {
        setState((current) => ({
          ...current,
          recorder: {
            ...current.recorder,
            connected: runtimeState.connected,
            running: runtimeState.activeInputs.some((input) => input.active),
            activeInputs: runtimeState.activeInputs,
            battery: runtimeState.battery,
          },
        }));
      },
      onLog: (message) => {
        setState((current) => ({
          ...current,
          recorder: {
            ...current.recorder,
            logs: [message, ...current.recorder.logs].slice(0, 30),
          },
        }));
      },
    });

    recorderClientRef.current = recorderClient;
    recorderClient.connect();
    await recorderClient.start(selectedInputs);
    await startBatteryReporting(recorderClient, batteryCleanupRef, setState);
    await requestWakeLock(wakeLockRef, setState);

    setState((current) => ({
      ...current,
        error: '',
        recorder: {
          ...current.recorder,
          autoRecordEnabled: true,
          availableInputs,
          selectedInputIds,
          running: true,
        },
      }));
  }

  async function stopRecorderMode() {
    await destroyRecorderRuntime(recorderClientRef, batteryCleanupRef, wakeLockRef);
    setState((current) => ({
      ...current,
      recorder: {
        ...current.recorder,
        autoRecordEnabled: false,
        connected: false,
        running: false,
        activeInputs: [],
      },
    }));
  }

  async function sendCapture(durationSeconds) {
    setState((current) => ({
      ...current,
      error: '',
      controller: { ...current.controller, busy: true },
    }));

    try {
      const urls = createBackendUrls(state.backendUrl);
      const response = await fetch(urls.captureRequestsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationSeconds }),
      });

      if (!response.ok) {
        throw new Error(`Capture request failed with ${response.status}`);
      }

      const body = await response.json();
      const controllerTimestamp = body.controllerTimestamp;

      setState((current) => ({
        ...current,
        controller: {
          ...current.controller,
          busy: false,
          lastControllerTimestamp: controllerTimestamp,
        },
      }));

      const transcription = window.prompt('Optional transcription for this cat sound:');
      if (transcription !== null) {
        await fetch(urls.transcriptionsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ controllerTimestamp, transcription }),
        });
      }
    } catch (error) {
      setState((current) => ({
        ...current,
        error: String(error?.message || error),
        controller: { ...current.controller, busy: false },
      }));
    }
  }

  function switchRole(role) {
    setState((current) => ({ ...current, role, error: '' }));

    if (role === 'controller') {
      void destroyRecorderRuntime(recorderClientRef, batteryCleanupRef, wakeLockRef);
      connectControllerMode();
      return;
    }

    cleanupControllerSocket(controllerSocketRef, controllerReconnectRef);
  }

  return (
    <main className="app-shell">
      <section className="panel hero-panel">
        <div>
          <p className="eyebrow">Retroactive Cat Sound Recorder</p>
          <h1>Leave recorders around the house. Capture the cat after the fact.</h1>
          <p className="subtle">
            Browser recorders keep a rolling 5 minute audio loop. The controller asks every recorder to upload the
            requested slice on demand.
          </p>
        </div>

        <label className="field">
          <span>Backend URL</span>
          <input
            value={state.backendUrl}
            onChange={(event) => {
              const backendUrl = event.target.value;
              setState((current) => ({ ...current, backendUrl }));
            }}
            placeholder="http://192.168.1.50:3001"
          />
        </label>

        <div className="role-grid">
          <button className={state.role === 'controller' ? 'selected' : ''} onClick={() => switchRole('controller')}>
            Controller
          </button>
          <button className={state.role === 'recorder' ? 'selected' : ''} onClick={() => switchRole('recorder')}>
            Recorder
          </button>
        </div>

        {state.error ? <p className="error-box">{state.error}</p> : null}
      </section>

      {state.role === 'controller' ? (
        <section className="panel controller-panel">
          <div className="section-header">
            <h2>Controller</h2>
            <span className={state.controller.connected ? 'status-pill online' : 'status-pill offline'}>
              {state.controller.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <div className="capture-grid">
            {CAPTURE_PRESETS.map((preset) => (
              <button
                key={preset.seconds}
                className="capture-button"
                disabled={state.controller.busy}
                onClick={() => sendCapture(preset.seconds)}
              >
                <strong>{preset.label}</strong>
              </button>
            ))}
          </div>

          <div className="section-header">
            <h3>Connected Recorders</h3>
            <span>{state.controller.recorders.length}</span>
          </div>

          <div className="recorder-list">
            {state.controller.recorders.length === 0 ? <p className="subtle">No recorder clients connected yet.</p> : null}
            {state.controller.recorders.map((recorder) => (
              <article key={`${recorder.deviceName}-${recorder.connectedAt}`} className="recorder-card">
                <div className="recorder-card-header">
                  <h4>{recorder.deviceName}</h4>
                  <span>{recorder.clientType}</span>
                </div>
                <p>
                  Battery:{' '}
                  {recorder.battery
                    ? `${Math.round((recorder.battery.level || 0) * 100)}% ${recorder.battery.charging ? 'charging' : 'on battery'}`
                    : 'unknown'}
                </p>
                <ul className="input-list">
                  {(recorder.inputs || []).map((input) => (
                    <li key={input.id}>
                      <span>{input.inputName || input.label}</span>
                      <span>{input.sampleRate ? `${input.sampleRate} Hz · ${formatLevel(input.level)}` : 'waiting for audio'}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {state.role === 'recorder' ? (
        <section className="panel recorder-panel">
          <div className="section-header">
            <h2>Recorder</h2>
            <span className={state.recorder.connected ? 'status-pill online' : 'status-pill offline'}>
              {state.recorder.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <label className="field">
            <span>Device name</span>
            <input
              value={state.recorder.deviceName}
              onChange={(event) => {
                const deviceName = event.target.value;
                saveDeviceName(deviceName);
                setState((current) => ({
                  ...current,
                  recorder: { ...current.recorder, deviceName },
                }));
                recorderClientRef.current?.setDeviceName(deviceName.trim() || 'web-recorder');
              }}
              placeholder="web-recorder"
            />
          </label>

          <div className="button-row">
            <button onClick={loadInputs} disabled={state.recorder.loadingInputs}>
              {state.recorder.loadingInputs ? 'Loading inputs...' : 'Allow mic and start recording'}
            </button>
            <button className="secondary" onClick={stopRecorderMode} disabled={!state.recorder.running}>
              Stop
            </button>
          </div>

          <p className="subtle">Recording starts automatically after microphone access is granted.</p>

          <div className="input-picker">
            {state.recorder.availableInputs.length === 0 ? <p className="subtle">Load the available microphones first.</p> : null}
            {state.recorder.availableInputs.map((input) => {
              const selected = state.recorder.selectedInputIds.includes(input.id);
              const gainEnabled = !!state.recorder.inputGainEnabled[input.id];
              const gain = getInputGainDb(state.recorder.inputGains[input.id]);
              return (
                <label key={input.id} className="input-card">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(event) => {
                      const nextSelectedInputIds = event.target.checked
                        ? [...state.recorder.selectedInputIds, input.id]
                        : state.recorder.selectedInputIds.filter((value) => value !== input.id);
                      const nextRecorderState = {
                        ...state.recorder,
                        selectedInputIds: nextSelectedInputIds,
                      };

                      setState((current) => ({
                        ...current,
                        recorder: {
                          ...current.recorder,
                          selectedInputIds: nextSelectedInputIds,
                        },
                      }));

                      if (state.recorder.running) {
                        void startRecorderMode(nextRecorderState);
                      }
                    }}
                  />
                  <div>
                    <strong>{input.label}</strong>
                    <input
                      value={state.recorder.inputAliases[input.id] || ''}
                      onChange={(event) => {
                        const alias = event.target.value;
                        const selectedCount = state.recorder.selectedInputIds.includes(input.id)
                          ? state.recorder.selectedInputIds.length
                          : state.recorder.selectedInputIds.length + 1;
                        setState((current) => ({
                          ...current,
                          recorder: {
                            ...current.recorder,
                            inputAliases: {
                              ...current.recorder.inputAliases,
                              [input.id]: alias,
                            },
                          },
                        }));
                        recorderClientRef.current?.setInputConfig(input.id, {
                          inputName: buildInputName(input, alias, selectedCount),
                        });
                      }}
                      placeholder="Optional input name"
                    />
                    <label className="subtle checkbox-row">
                      <input
                        type="checkbox"
                        checked={gainEnabled}
                        onChange={(event) => {
                          const enabled = event.target.checked;
                          setState((current) => ({
                            ...current,
                            recorder: {
                              ...current.recorder,
                              inputGainEnabled: {
                                ...current.recorder.inputGainEnabled,
                                [input.id]: enabled,
                              },
                            },
                          }));
                          recorderClientRef.current?.setInputConfig(input.id, {
                            gain: enabled ? gainFromDb(gain) : 1,
                          });
                        }}
                      />
                      <span>Manual gain for this input</span>
                    </label>
                    <input
                      type="range"
                      min="-12"
                      max="42"
                      step="1"
                      value={gain}
                      disabled={!gainEnabled}
                      onChange={(event) => {
                        const nextGain = Number(event.target.value);
                        setState((current) => ({
                          ...current,
                          recorder: {
                            ...current.recorder,
                            inputGains: {
                              ...current.recorder.inputGains,
                              [input.id]: nextGain,
                            },
                          },
                        }));
                        recorderClientRef.current?.setInputConfig(input.id, {
                          gain: gainFromDb(nextGain),
                        });
                      }}
                    />
                    <div className="slider-value">{formatGain(gain)}</div>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="runtime-grid">
            <article className="runtime-card">
              <h3>Recorder status</h3>
              <p>Battery: {formatBattery(state.recorder.battery)}</p>
              <ul className="input-list">
                {state.recorder.activeInputs.map((input) => (
                  <li key={input.id}>
                    <span>{input.inputName || input.label}</span>
                    <span>{input.sampleRate ? `${input.sampleRate} Hz · ${formatLevel(input.level)}` : 'starting...'}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="runtime-card">
              <h3>Recent logs</h3>
              <ul className="log-list">
                {state.recorder.logs.length === 0 ? <li>Idle</li> : null}
                {state.recorder.logs.map((log, index) => (
                  <li key={`${log}-${index}`}>{log}</li>
                ))}
              </ul>
            </article>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function buildInputName(input, alias, totalSelected) {
  const trimmed = (alias || '').trim();
  if (trimmed) {
    return trimmed;
  }
  if (totalSelected > 1) {
    return input.label;
  }
  return '';
}

function formatBattery(battery) {
  if (!battery) {
    return 'unknown';
  }

  return `${Math.round((battery.level || 0) * 100)}% ${battery.charging ? 'charging' : 'on battery'}`;
}

function getInputGainDb(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(-12, Math.min(42, numeric));
}

function gainFromDb(db) {
  return 10 ** (db / 20);
}

function formatGain(db) {
  const sign = db > 0 ? '+' : '';
  return `${sign}${db} dB (${gainFromDb(db).toFixed(1)}x)`;
}

function formatLevel(level) {
  if (!Number.isFinite(level)) {
    return 'level unknown';
  }

  const percent = Math.max(0, Math.min(100, Math.round(level * 100)));
  return `peak ${percent}%`;
}

function getInitialDeviceName() {
  if (typeof window === 'undefined') {
    return 'web-recorder';
  }

  return window.localStorage.getItem(DEVICE_NAME_STORAGE_KEY)?.trim() || 'web-recorder';
}

function saveDeviceName(deviceName) {
  if (typeof window === 'undefined') {
    return;
  }

  const trimmed = deviceName.trim();
  window.localStorage.setItem(DEVICE_NAME_STORAGE_KEY, trimmed || 'web-recorder');
}

async function startBatteryReporting(recorderClient, batteryCleanupRef, setState) {
  batteryCleanupRef.current?.();
  batteryCleanupRef.current = null;

  if (!navigator.getBattery) {
    recorderClient.setBattery(null);
    return;
  }

  const battery = await navigator.getBattery();
  const update = () => {
    const snapshot = {
      level: battery.level,
      charging: battery.charging,
    };
    recorderClient.setBattery(snapshot);
    setState((current) => ({
      ...current,
      recorder: { ...current.recorder, battery: snapshot },
    }));
  };

  update();
  battery.addEventListener('levelchange', update);
  battery.addEventListener('chargingchange', update);

  batteryCleanupRef.current = () => {
    battery.removeEventListener('levelchange', update);
    battery.removeEventListener('chargingchange', update);
  };
}

async function requestWakeLock(wakeLockRef, setState) {
  if (!navigator.wakeLock?.request) {
    return;
  }

  try {
    wakeLockRef.current = await navigator.wakeLock.request('screen');
    wakeLockRef.current.addEventListener('release', () => {
      setState((current) => ({
        ...current,
        recorder: { ...current.recorder, logs: ['Screen wake lock released', ...current.recorder.logs].slice(0, 30) },
      }));
    });
  } catch (_error) {
    setState((current) => ({
      ...current,
      recorder: { ...current.recorder, logs: ['Wake lock not available', ...current.recorder.logs].slice(0, 30) },
    }));
  }
}

async function destroyRecorderRuntime(recorderClientRef, batteryCleanupRef, wakeLockRef) {
  batteryCleanupRef.current?.();
  batteryCleanupRef.current = null;
  wakeLockRef.current?.release?.();
  wakeLockRef.current = null;
  if (recorderClientRef.current) {
    await recorderClientRef.current.destroy();
    recorderClientRef.current = null;
  }
}

function cleanupControllerSocket(controllerSocketRef, controllerReconnectRef) {
  clearTimeout(controllerReconnectRef.current);
  controllerReconnectRef.current = null;
  controllerSocketRef.current?.close();
  controllerSocketRef.current = null;
}
