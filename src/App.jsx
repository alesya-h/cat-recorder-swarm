import { useState } from 'react';
import { normalizeBackendUrl } from '../shared/net.js';
import { ControllerPanel } from './features/controller/ControllerPanel.jsx';
import { useControllerConnection } from './features/controller/useControllerConnection.js';
import { RecorderPanel } from './features/recorder/RecorderPanel.jsx';
import { useRecorderRuntime } from './features/recorder/useRecorderRuntime.js';

export default function App() {
  const [backendUrl, setBackendUrl] = useState(() => normalizeBackendUrl());
  const [error, setError] = useState('');
  const { controller, sendCapture } = useControllerConnection({ backendUrl, setError });
  const {
    recorder,
    setDeviceName,
    setInputSelected,
    setInputAlias,
    setInputGainEnabled,
    setInputGain,
  } = useRecorderRuntime({ backendUrl, setError });

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
            value={backendUrl}
            onChange={(event) => {
              setBackendUrl(event.target.value);
              setError('');
            }}
            placeholder="http://192.168.1.50:3001"
          />
        </label>

        {error ? <p className="error-box">{error}</p> : null}
      </section>

      <ControllerPanel controller={controller} onCapture={sendCapture} />

      <RecorderPanel
        recorder={recorder}
        onDeviceNameChange={setDeviceName}
        onInputSelected={setInputSelected}
        onInputAliasChange={setInputAlias}
        onInputGainEnabledChange={setInputGainEnabled}
        onInputGainChange={setInputGain}
      />
    </main>
  );
}
