import { useEffect, useRef, useState } from 'react';
import { createRecorderClient } from '../../../shared/recorder-client.js';
import { loadBrowserAudioInputs, startBrowserInput } from '../../audio/browser-inputs.js';
import { destroyRecorderRuntime, requestWakeLock, startBatteryReporting } from './recorder-runtime.js';
import { getInitialRecorderPrefs, persistRecorderPrefs } from './recorder-prefs.js';
import { buildInputName, gainFromDb, getInputGainDb } from './recorder-utils.js';

function makeInitialRecorderState() {
  const prefs = getInitialRecorderPrefs();

  return {
    deviceName: prefs.deviceName,
    loadingInputs: false,
    autoRecordEnabled: true,
    availableInputs: [],
    selectedInputIds: prefs.selectedInputIds,
    hasSavedSelection: prefs.hasSavedSelection,
    inputAliases: prefs.inputAliases,
    inputGainEnabled: prefs.inputGainEnabled,
    inputGains: prefs.inputGains,
    connected: false,
    running: false,
    activeInputs: [],
    battery: null,
    logs: [],
  };
}

export function useRecorderRuntime({ backendUrl, setError }) {
  const [recorder, setRecorder] = useState(makeInitialRecorderState);
  const recorderClientRef = useRef(null);
  const recorderStartingRef = useRef(false);
  const inputsRequestedRef = useRef(false);
  const batteryCleanupRef = useRef(null);
  const wakeLockRef = useRef(null);

  useEffect(() => {
    return () => {
      void destroyRecorderRuntime(recorderClientRef, batteryCleanupRef, wakeLockRef);
    };
  }, []);

  useEffect(() => {
    if (inputsRequestedRef.current || recorder.loadingInputs || recorder.availableInputs.length > 0) {
      return;
    }

    inputsRequestedRef.current = true;
    void loadInputs();
  }, [recorder.loadingInputs, recorder.availableInputs.length]);

  useEffect(() => {
    if (!recorder.autoRecordEnabled || recorder.availableInputs.length === 0 || recorder.running || recorderStartingRef.current) {
      return;
    }

    recorderStartingRef.current = true;
    void startRecorderMode().finally(() => {
      recorderStartingRef.current = false;
    });
  }, [backendUrl, recorder.autoRecordEnabled, recorder.availableInputs, recorder.running]);

  useEffect(() => {
    recorderClientRef.current?.setDeviceName(recorder.deviceName.trim() || 'web-recorder');
  }, [recorder.deviceName]);

  useEffect(() => {
    const recorderClient = recorderClientRef.current;
    if (!recorderClient) {
      return;
    }

    const selectedCount = recorder.availableInputs.filter((input) => recorder.selectedInputIds.includes(input.id)).length;
    for (const input of recorder.availableInputs) {
      recorderClient.setInputConfig(input.id, {
        inputName: buildInputName(input, recorder.inputAliases[input.id], selectedCount),
        submitEnabled: recorder.selectedInputIds.includes(input.id),
        gain: recorder.inputGainEnabled[input.id] ? gainFromDb(getInputGainDb(recorder.inputGains[input.id])) : 1,
      });
    }
  }, [recorder.availableInputs, recorder.selectedInputIds, recorder.inputAliases, recorder.inputGainEnabled, recorder.inputGains]);

  async function loadInputs() {
    setError('');
    setRecorder((current) => ({ ...current, loadingInputs: true }));

    try {
      const availableInputs = await loadBrowserAudioInputs();

      setRecorder((current) => {
        const selectedInputIds = current.hasSavedSelection
          ? availableInputs.filter((input) => current.selectedInputIds.includes(input.id)).map((input) => input.id)
          : availableInputs.map((input) => input.id);

        return persistRecorderPrefs({
          ...current,
          autoRecordEnabled: true,
          loadingInputs: false,
          availableInputs,
          selectedInputIds,
        });
      });
    } catch (error) {
      setError(String(error?.message || error));
      setRecorder((current) => ({ ...current, loadingInputs: false }));
    }
  }

  async function startRecorderMode(recorderState = recorder) {
    const effectiveDeviceName = recorderState.deviceName.trim() || 'web-recorder';
    let availableInputs = recorderState.availableInputs;

    if (availableInputs.length === 0) {
      try {
        availableInputs = await loadBrowserAudioInputs();
      } catch (error) {
        setError(String(error?.message || error));
        return;
      }
    }

    const selectedInputIds = recorderState.hasSavedSelection
      ? availableInputs.filter((input) => recorderState.selectedInputIds.includes(input.id)).map((input) => input.id)
      : availableInputs.map((input) => input.id);

    const selectedCount = selectedInputIds.length;
    const selectedInputs = availableInputs.map((input) => ({
      ...input,
      gain: recorderState.inputGainEnabled[input.id] ? gainFromDb(getInputGainDb(recorderState.inputGains[input.id])) : 1,
      inputName: buildInputName(input, recorderState.inputAliases[input.id], selectedCount),
      submitEnabled: selectedInputIds.includes(input.id),
    }));

    if (selectedInputs.length === 0) {
      setError('No audio inputs available');
      return;
    }

    await destroyRecorderRuntime(recorderClientRef, batteryCleanupRef, wakeLockRef);

    const recorderClient = createRecorderClient({
      backendUrl,
      deviceName: effectiveDeviceName,
      clientType: 'web',
      preferredFormat: 'wav',
      startInput: startBrowserInput,
      onState: (runtimeState) => {
        setRecorder((current) => ({
          ...current,
          connected: runtimeState.connected,
          running: runtimeState.activeInputs.some((input) => input.active),
          activeInputs: runtimeState.activeInputs,
          battery: runtimeState.battery,
        }));
      },
      onLog: (message) => {
        setRecorder((current) => ({
          ...current,
          logs: [message, ...current.logs].slice(0, 30),
        }));
      },
    });

    recorderClientRef.current = recorderClient;
    recorderClient.connect();
    await recorderClient.start(selectedInputs);
    await startBatteryReporting(recorderClient, batteryCleanupRef, setRecorder);
    await requestWakeLock(wakeLockRef, setRecorder);

    setError('');
    setRecorder((current) => ({
      ...current,
      autoRecordEnabled: true,
      availableInputs,
      selectedInputIds,
      running: true,
    }));
  }

  function setDeviceName(deviceName) {
    setRecorder((current) => persistRecorderPrefs({ ...current, deviceName }));
  }

  function setInputSelected(inputId, selected) {
    setRecorder((current) => persistRecorderPrefs({
      ...current,
      hasSavedSelection: true,
      selectedInputIds: selected
        ? [...current.selectedInputIds, inputId]
        : current.selectedInputIds.filter((value) => value !== inputId),
    }));
  }

  function setInputAlias(inputId, alias) {
    setRecorder((current) => persistRecorderPrefs({
      ...current,
      inputAliases: {
        ...current.inputAliases,
        [inputId]: alias,
      },
    }));
  }

  function setInputGainEnabled(inputId, enabled) {
    setRecorder((current) => persistRecorderPrefs({
      ...current,
      inputGainEnabled: {
        ...current.inputGainEnabled,
        [inputId]: enabled,
      },
    }));
  }

  function setInputGain(inputId, nextGain) {
    setRecorder((current) => persistRecorderPrefs({
      ...current,
      inputGains: {
        ...current.inputGains,
        [inputId]: nextGain,
      },
    }));
  }

  return {
    recorder,
    setDeviceName,
    setInputSelected,
    setInputAlias,
    setInputGainEnabled,
    setInputGain,
  };
}
