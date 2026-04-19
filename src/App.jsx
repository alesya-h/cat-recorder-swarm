import { useState } from 'react';
import { normalizeBackendUrl } from '../shared/net.js';
import { ControllerPanel } from './features/controller/ControllerPanel.jsx';
import { useControllerConnection } from './features/controller/useControllerConnection.js';
import { RecorderPanel } from './features/recorder/RecorderPanel.jsx';
import { useRecorderRuntime } from './features/recorder/useRecorderRuntime.js';
import { formatBattery, formatLevel } from './lib/formatters.js';

const BACKEND_URL = normalizeBackendUrl();

export default function App() {
  const [error, setError] = useState('');
  const { controller, sendCapture } = useControllerConnection({ backendUrl: BACKEND_URL, setError });
  const {
    recorder,
    setDeviceName,
    setInputSelected,
    setInputAlias,
    setInputGainEnabled,
    setInputGain,
  } = useRecorderRuntime({ backendUrl: BACKEND_URL, setError });

  return (
    <div className="app">
      <header className="status-bar">
        <div className="conn-dots">
          <span className={`dot${controller.connected ? ' on' : ''}`} title="Controller connection" />
          <span className={`dot${recorder.connected ? ' on' : ''}`} title="Recorder connection" />
        </div>

        {recorder.battery && (
          <span className="battery">
            {Math.round((recorder.battery.level || 0) * 100)}%
            {recorder.battery.charging ? ' \u26A1' : ''}
          </span>
        )}

        <span className="spacer" />
        <span className="device-name">{recorder.deviceName || 'web-recorder'}</span>
      </header>

      {error && (
        <div className="error-bar" onClick={() => setError('')}>
          <span>{error}</span>
          <span className="dismiss">&times;</span>
        </div>
      )}

      <div className="info-grid">
        <details>
          <summary>
            Recorders
            <span className="badge">{controller.recorders.length}</span>
          </summary>
          <div className="section-body">
            {controller.recorders.length === 0 ? (
              <p className="dim">No recorders connected</p>
            ) : (
              controller.recorders.map((rec) => (
                <div key={`${rec.deviceName}-${rec.connectedAt}`} className="card">
                  <div className="card-header">
                    <strong>{rec.deviceName}</strong>
                    <span className="dim">{formatBattery(rec.battery)}</span>
                  </div>
                  {(rec.inputs || []).length > 0 && (
                    <ul className="compact-list">
                      {rec.inputs.map((input) => (
                        <li key={input.id}>
                          <span>{input.inputName || input.label}</span>
                          <span>
                            {input.sampleRate
                              ? `${input.sampleRate} Hz \u00B7 ${formatLevel(input.level)}`
                              : 'waiting\u2026'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </div>
        </details>

        <div className="settings-stack">
          <RecorderPanel
            recorder={recorder}
            onDeviceNameChange={setDeviceName}
            onInputSelected={setInputSelected}
            onInputAliasChange={setInputAlias}
            onInputGainEnabledChange={setInputGainEnabled}
            onInputGainChange={setInputGain}
          />
        </div>
      </div>

      <ControllerPanel busy={controller.busy} onCapture={sendCapture} />
    </div>
  );
}
