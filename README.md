# Cat Recorder

Retroactive cat sound recorder for phones around the house plus an optional Node CLI recorder.

## What it does

- Recorder clients keep a rolling 5 minute audio buffer.
- The controller sends a capture request for the last 300, 60, 30, or 10 seconds.
- Each recorder uploads its own WAV clip to `recordings/<controllerTimestamp>/`.
- Optional controller transcription is stored as `transcription.txt` in the same folder.
- Files are named as `devicename_from_to.wav` or `devicename_inputname_from_to.wav`.

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

## Recorder CLI

```bash
node cli/recorder.js http://192.168.1.50:3001 "Home server"
```

The CLI records from all available audio input devices and uses each device name as the input name when more than one input is present.

On Linux the CLI also needs the ALSA runtime library, typically available via the `libasound2` package.

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

## Storage

- Default recording directory: `./recordings`
- Override with `RECORDINGS_DIR=/some/path`
