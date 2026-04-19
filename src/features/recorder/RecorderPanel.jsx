import { formatLevel } from '../../lib/formatters.js';
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
    <>
      <details>
        <summary>
          Settings
          {recorder.activeInputs.length > 0 && (
            <span className="badge">{recorder.activeInputs.length} active</span>
          )}
        </summary>
        <div className="section-body">
          <label className="field">
            <span>Device name</span>
            <input
              value={recorder.deviceName}
              onChange={(e) => onDeviceNameChange(e.target.value)}
              placeholder="web-recorder"
            />
          </label>

          {recorder.loadingInputs && <p className="dim">Requesting mic access&hellip;</p>}

          <div className="inputs-list">
            {recorder.availableInputs.map((input) => {
              const selected = recorder.selectedInputIds.includes(input.id);
              const gainEnabled = !!recorder.inputGainEnabled[input.id];
              const gain = getInputGainDb(recorder.inputGains[input.id]);

              return (
                <label key={input.id} className="input-card">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => onInputSelected(input.id, e.target.checked)}
                  />
                  <div>
                    <div className="input-label">{input.label}</div>
                    <input
                      value={recorder.inputAliases[input.id] || ''}
                      onChange={(e) => onInputAliasChange(input.id, e.target.value)}
                      placeholder="Alias"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="gain-row">
                      <label onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={gainEnabled}
                          onChange={(e) => onInputGainEnabledChange(input.id, e.target.checked)}
                        />
                        Gain
                      </label>
                      <input
                        type="range"
                        min="-12"
                        max="42"
                        step="1"
                        value={gain}
                        disabled={!gainEnabled}
                        onChange={(e) => onInputGainChange(input.id, Number(e.target.value))}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="gain-value">{formatGain(gain)}</span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {recorder.activeInputs.length > 0 && (
            <div className="active-inputs">
              <div className="active-label">Active inputs</div>
              <ul className="compact-list">
                {recorder.activeInputs.map((input) => (
                  <li key={input.id}>
                    <span>{input.inputName || input.label}</span>
                    <span>
                      {input.sampleRate
                        ? `${input.sampleRate} Hz \u00B7 ${formatLevel(input.level)}`
                        : 'starting\u2026'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>

      <details>
        <summary>
          Logs
          {recorder.logs.length > 0 && <span className="badge">{recorder.logs.length}</span>}
        </summary>
        <div className="section-body">
          {recorder.logs.length === 0 ? (
            <p className="dim">No activity yet</p>
          ) : (
            <ul className="log-list">
              {recorder.logs.map((log, i) => (
                <li key={`${log}-${i}`}>{log}</li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </>
  );
}
