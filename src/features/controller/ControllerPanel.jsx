import { CAPTURE_PRESETS } from '../../../shared/constants.js';

export function ControllerPanel({ busy, onCapture }) {
  return (
    <div className="capture-grid">
      {CAPTURE_PRESETS.map((preset) => (
        <button
          key={preset.seconds}
          className="capture-btn"
          disabled={busy}
          onClick={() => onCapture(preset.seconds)}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
