import { CAPTURE_PRESETS } from '../../../shared/constants.js';
import { formatBattery, formatLevel } from '../../lib/formatters.js';

export function ControllerPanel({ controller, onCapture }) {
  return (
    <section className="panel controller-panel">
      <div className="section-header">
        <h2>Controller</h2>
        <span className={controller.connected ? 'status-pill online' : 'status-pill offline'}>
          {controller.connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <div className="capture-grid">
        {CAPTURE_PRESETS.map((preset) => (
          <button
            key={preset.seconds}
            className="capture-button"
            disabled={controller.busy}
            onClick={() => onCapture(preset.seconds)}
          >
            <strong>{preset.label}</strong>
          </button>
        ))}
      </div>

      <div className="section-header">
        <h3>Connected Recorders</h3>
        <span>{controller.recorders.length}</span>
      </div>

      <div className="recorder-list">
        {controller.recorders.length === 0 ? <p className="subtle">No recorder clients connected yet.</p> : null}
        {controller.recorders.map((recorder) => (
          <article key={`${recorder.deviceName}-${recorder.connectedAt}`} className="recorder-card">
            <div className="recorder-card-header">
              <h4>{recorder.deviceName}</h4>
              <span>{recorder.clientType}</span>
            </div>
            <p>Battery: {formatBattery(recorder.battery)}</p>
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
  );
}
