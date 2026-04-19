export async function startBatteryReporting(recorderClient, batteryCleanupRef, setRecorder) {
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
    setRecorder((current) => ({ ...current, battery: snapshot }));
  };

  update();
  battery.addEventListener('levelchange', update);
  battery.addEventListener('chargingchange', update);

  batteryCleanupRef.current = () => {
    battery.removeEventListener('levelchange', update);
    battery.removeEventListener('chargingchange', update);
  };
}

export async function requestWakeLock(wakeLockRef, setRecorder) {
  if (!navigator.wakeLock?.request) {
    return;
  }

  try {
    wakeLockRef.current = await navigator.wakeLock.request('screen');
    wakeLockRef.current.addEventListener('release', () => {
      setRecorder((current) => ({
        ...current,
        logs: ['Screen wake lock released', ...current.logs].slice(0, 30),
      }));
    });
  } catch (_error) {
    setRecorder((current) => ({
      ...current,
      logs: ['Wake lock not available', ...current.logs].slice(0, 30),
    }));
  }
}

export async function destroyRecorderRuntime(recorderClientRef, batteryCleanupRef, wakeLockRef) {
  batteryCleanupRef.current?.();
  batteryCleanupRef.current = null;
  wakeLockRef.current?.release?.();
  wakeLockRef.current = null;

  if (recorderClientRef.current) {
    await recorderClientRef.current.destroy();
    recorderClientRef.current = null;
  }
}
