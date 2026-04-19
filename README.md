# Cat Recorder

Retroactive cat sound recorder for phones around the house.

## What it does

- The web page is both controller and recorder at the same time.
- Browser recorders automatically request mic access on load and keep a rolling 5 minute buffer once permission is granted.
- The controller sends a capture request for the last 300, 60, 30, or 10 seconds.
- Each recorder uploads its own clip to `recordings/<controllerTimestamp>/`.
- Web clients currently upload WAV files by default.
- Optional controller transcription is stored as `transcription.txt` in the same folder.
- Files are named as `devicename_from_to.wav` or `devicename_inputname_from_to.wav`.
- Recorder checkboxes control whether an input is submitted on capture. Inputs continue recording even when unticked.
- Recorder device name, selected inputs, and per-input gain settings are saved in local storage.

## How To Use

1. Open the page on one or more devices.
2. Let the page request microphone permission automatically.
3. Give each device a name if you want something nicer than `web-recorder`.
4. Leave the page open. It will keep recording automatically.
5. Use the always-visible capture buttons on any device to save the last 5 minutes, 60 seconds, 30 seconds, or 10 seconds from all connected recorders.
6. Optionally add a transcription when prompted.

If you untick all inputs on a device, that device still behaves as a controller but will not submit any audio clips.

## Run it

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm start
```

Auto-generated self-signed HTTPS:

```bash
npm run build
npm run start:https
```

The backend listens on `PORT` or `3001`.

## HTTPS note

Browsers only allow microphone access on secure origins such as `https://...` or `http://localhost`.

If you want phones on your LAN to record directly from the browser, run the server with TLS:

```bash
HTTPS_CERT_FILE=/path/to/cert.pem HTTPS_KEY_FILE=/path/to/key.pem npm start
```

Or let the server generate and cache a self-signed certificate automatically:

```bash
npm run start:https
```

The generated certificate covers `localhost`, `127.0.0.1`, `::1`, and the machine's current network addresses. You can add more hostnames or IPs with `AUTO_HTTPS_HOSTS=name-or-ip,other-name-or-ip npm run start:https`.

Important: this only makes the app speak HTTPS. Mobile browsers may still refuse microphone access until the certificate is trusted on the device.

## Recorder Notes

- Browser recording starts automatically after microphone access is available.
- Per-input manual gain is available in dB and applies live while recording.
- The on-screen meter shows rolling peak level over roughly the last half second.
- Recorder and controller websocket connections automatically reconnect after backend restarts.

## Storage

- Default recording directory: `./recordings`
- Override with `RECORDINGS_DIR=/some/path`
