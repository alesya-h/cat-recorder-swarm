const DEVICE_NAME_STORAGE_KEY = 'cat-recorder-device-name';
const RECORDER_PREFS_STORAGE_KEY = 'cat-recorder-prefs';

export function getInitialRecorderPrefs() {
  if (typeof window === 'undefined') {
    return {
      deviceName: 'web-recorder',
      selectedInputIds: [],
      hasSavedSelection: false,
      inputAliases: {},
      inputGainEnabled: {},
      inputGains: {},
    };
  }

  try {
    const raw = window.localStorage.getItem(RECORDER_PREFS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const fallbackDeviceName = window.localStorage.getItem(DEVICE_NAME_STORAGE_KEY)?.trim() || 'web-recorder';

    return {
      deviceName: typeof parsed.deviceName === 'string' && parsed.deviceName.trim() ? parsed.deviceName : fallbackDeviceName,
      selectedInputIds: Array.isArray(parsed.selectedInputIds) ? parsed.selectedInputIds : [],
      hasSavedSelection: Array.isArray(parsed.selectedInputIds),
      inputAliases: isPlainObject(parsed.inputAliases) ? parsed.inputAliases : {},
      inputGainEnabled: isPlainObject(parsed.inputGainEnabled) ? parsed.inputGainEnabled : {},
      inputGains: isPlainObject(parsed.inputGains) ? parsed.inputGains : {},
    };
  } catch {
    return {
      deviceName: window.localStorage.getItem(DEVICE_NAME_STORAGE_KEY)?.trim() || 'web-recorder',
      selectedInputIds: [],
      hasSavedSelection: false,
      inputAliases: {},
      inputGainEnabled: {},
      inputGains: {},
    };
  }
}

export function persistRecorderPrefs(recorder) {
  if (typeof window !== 'undefined') {
    const deviceName = recorder.deviceName?.trim() || 'web-recorder';
    window.localStorage.setItem(DEVICE_NAME_STORAGE_KEY, deviceName);
    window.localStorage.setItem(
      RECORDER_PREFS_STORAGE_KEY,
      JSON.stringify({
        deviceName,
        selectedInputIds: recorder.selectedInputIds,
        inputAliases: recorder.inputAliases,
        inputGainEnabled: recorder.inputGainEnabled,
        inputGains: recorder.inputGains,
      }),
    );
  }

  return recorder;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
