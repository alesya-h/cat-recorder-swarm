import { formatBattery, formatLevel } from '../../lib/formatters.js';
import { formatGain, getInputGainDb } from './recorder-utils.js';

export function RecorderPanel({
  recorder,
  onDeviceNameChange,
  onInputSelected,
  onInputAliasChange,
  onInputGainEnabledChange,
  onInputGainChange,
}) {
  return (
    <section className="panel recorder-panel">
      <div className="section-header">
        <h2>Recorder</h2>
        <span className={recorder.connected ? 'status-pill online' : 'status-pill offline'}>
          {recorder.connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <label className="field">
        <span>Device name</span>
        <input
          value={recorder.deviceName}
          onChange={(event) => onDeviceNameChange(event.target.value)}
          placeholder="web-recorder"
        />
      </label>

      <p className="subtle">
        {recorder.loadingInputs
          ? 'Requesting microphone access and starting recording...'
          : 'Recording starts automatically as soon as microphone access is available.'}
      </p>

      <div className="input-picker">
        {recorder.availableInputs.length === 0 ? <p className="subtle">Waiting for microphone inputs...</p> : null}
        {recorder.availableInputs.map((input) => {
          const selected = recorder.selectedInputIds.includes(input.id);
          const gainEnabled = !!recorder.inputGainEnabled[input.id];
          const gain = getInputGainDb(recorder.inputGains[input.id]);

          return (
            <label key={input.id} className="input-card">
              <input
                type="checkbox"
                checked={selected}
                onChange={(event) => onInputSelected(input.id, event.target.checked)}
              />
              <div>
                <strong>{input.label}</strong>
                <input
                  value={recorder.inputAliases[input.id] || ''}
                  onChange={(event) => onInputAliasChange(input.id, event.target.value)}
                  placeholder="Optional input name"
                />
                <label className="subtle checkbox-row">
                  <input
                    type="checkbox"
                    checked={gainEnabled}
                    onChange={(event) => onInputGainEnabledChange(input.id, event.target.checked)}
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
                  onChange={(event) => onInputGainChange(input.id, Number(event.target.value))}
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
          <p>Battery: {formatBattery(recorder.battery)}</p>
          <ul className="input-list">
            {recorder.activeInputs.map((input) => (
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
            {recorder.logs.length === 0 ? <li>Idle</li> : null}
            {recorder.logs.map((log, index) => (
              <li key={`${log}-${index}`}>{log}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
