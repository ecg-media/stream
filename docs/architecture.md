# Architecture

Developer notes for the stream server. User documentation is in the [README](../README.md).

## Overview

```
Admin browser (publish.html)  --WebRTC send-->  mediasoup router  --WebRTC recv-->  Listener browsers (index.html)
ffmpeg (server audio input)   --RTP 127.0.0.1-->    (PlainTransport)
            \__________ socket.io signalling (server/index.js) __________/
```

A channel is fed either by a browser (WebRTC send transport, needs a secure context) or by an audio input of the
server (see [Server capture](#server-capture)), which an admin can start and stop from any device over plain HTTP.

- **server/index.js** – Express (static files), socket.io (signalling) and mediasoup (one worker, one router, one `WebRtcServer`).
  Every channel has at most one audio producer; every listener socket has at most one receive transport and consumer.
- **app/index.html + consumer.js** – listener page: channel chooser, play/stop, reconnect logic.
- **app/publish.html + publisher.js** – admin page: channels, sending (one send transport per channel), statistics, settings.
- **app/js/common.js** – icons (inline Material Icons SVG paths), theme switching, socket request helper.
- **app/js/i18n.js** – listener texts per channel language (`rtl` for Arabic, Farsi, Hebrew) and the admin texts
  (`ADMIN_TEXTS`: de, ru, en, uk; `data-i18n` / `data-i18n-label` attributes, choice stored in `localStorage.adminLang`).
- **app/js/visualize.js** – `Level`: loudness and frequency bands of a stream from an `AnalyserNode`; `Rings` draws the listener rings (one per band) on a canvas; `Level` also drives the admin
  level bar via the CSS variable `--level`. Neither touches the playback path.
- **app/js/mediasoup-client.js** – generated bundle, rebuild with `npm run build-client` after updating `mediasoup-client`.

## Latency

Audio is Opus forwarded by mediasoup without transcoding or server-side buffering; listeners play the WebRTC track
directly in an `<audio>` element (receiver jitter buffer ≈ 20–40 ms in a LAN). Keep it that way:

- do not route the playback through Web Audio, `MediaRecorder` or any buffering element;
- keep statistics, persistence and admin updates off the media path (they run on timers / are throttled);
- mobile browsers pause WebRTC once the screen locks (iOS Safari at once, Android Chrome after about a minute). While
  listening, `consumer.js` keeps the screen on: the Wake Lock API in a secure context, otherwise (plain HTTP) a muted,
  looping 10 s black 64 px H.264 video embedded as a data URI (CSP `media-src 'self' data:`), fixed behind the page at
  opacity 0.01 so browsers treat it as visible. It never touches the audio element. Tested in desktop Chromium only;
  iOS Safari and Android Chrome must be checked on real phones;
- `WebRtcServer` multiplexes all transports on `RTC_PORT` (UDP preferred, TCP fallback).

## Server capture

- `admin:devices` lists the inputs via ffmpeg: Linux reads `/proc/asound` (ALSA `plughw:CARD=<id>,DEV=<n>`, input count
  from the USB stream info, otherwise 2), Windows uses DirectShow (`-list_options`), macOS AVFoundation (short probe).
  The list is cached for 5 s. `admin:startCapture` only accepts a listed device and an input `1..inputs` (mono) or `0`
  (inputs 1+2 as stereo), and stores the choice as `channel.source` with `live: true`; only `admin:stopPublish` sets
  `live: false`. At start the server resumes every capture with `live: true` (with the stored input count, so a device
  that is not there yet is simply retried), i.e. a restart or power cut does not need an admin.
- **One ffmpeg process per device** (ALSA hardware devices can be opened only once): `asplit` + `pan` produce one
  output per channel, each encoded separately and sent as RTP to its channel's `PlainTransport`. Starting or stopping a
  channel restarts the device process with the new outputs.
- Each channel's transport is connected (no comedia) to fixed local source ports that ffmpeg binds via
  `localrtpport`/`localrtcpport`, so a restarted process reaches the same transport and producer; listeners only hear a
  short gap and never reconnect. ffmpeg does not send RTCP (`skip_rtcp`).
- A separate `asplit` branch measures every input (`asetnsamples` 4800 → `astats` peak per channel → `ametadata` print to
  stdout, `direct=1`); the server pushes `admin:levels` `{ <channelId>: 0..1 }` (−50…0 dBFS) to the `admins` room ten
  times per second. This branch is not on the media path and adds no latency.
- If ffmpeg exits with `bind failed` (another program took a source port between reservation and start), every channel of the device gets a new transport, producer and
  ports; listeners re-consume automatically.
- If ffmpeg exits unexpectedly, its last stderr line is shown on the channel (`capture.error`) and the process is
  restarted every 3 s while the channel is live. The channel stays live meanwhile.
- Low-latency settings: Opus `-application lowdelay` (2.5 ms look-ahead) with 10 ms frames, `-fflags nobuffer
  -flags low_delay`, zero probing, DirectShow `-audio_buffer_size 10` (its default is 500 ms). 64 kbit/s mono, 128 kbit/s stereo.
- ffmpeg 4.4 or newer (`astats` `measure_perchannel`; Ubuntu 22.04 ships 4.4.2) comes from `FFMPEG` or the `PATH`. Child processes end with the service: systemd and launchd stop the whole
  process group; the Windows service wrapper puts node into a job object with `KILL_ON_JOB_CLOSE`.
- The systemd unit adds the `audio` group. On a Linux desktop, PipeWire may hold the sound card while another program
  records; a headless server avoids that. macOS may deny microphone access to the background service.
- **Not tested yet:** capture on macOS, and capture while running as the Windows service (SYSTEM account). Tested on
  Windows as a normal process with five channels on three devices at once.

## Socket events

All requests use acknowledgements `(error, result)`; `error` is a stable code such as `not_logged_in`, `channel_not_found`, `already_live` or `too_many_attempts`, translated by the admin page (`ADMIN_TEXTS.*.errors`). Events prefixed with `admin:` require a session when a password is set.

| Event | Direction | Purpose |
|---|---|---|
| `channels` | server → all | `{ title, channels: [{ id, name, language, live }] }` on connect and on every change |
| `getRouterRtpCapabilities` | request | router capabilities for `Device.load` |
| `listen` `{ channelId }` | request | creates the receive transport (replaces a previous one) |
| `connectTransport` `{ transportId, dtlsParameters }` | request | DTLS for send or receive transports of this socket |
| `consume` `{ rtpCapabilities }` | request | consumer params, or `{ producerId: null }` when the channel is not live |
| `stopListening` | request | closes the receive transport |
| `consumerClosed` / `reloadPage` | server → listener | sender stopped / admin requested a reload |
| `admin:login` `{ password }` | request | returns `{ token }` (HMAC, 30 days) |
| `admin:state` | request + push to room `admins` | channels incl. listener counts, settings |
| `admin:saveChannel`, `admin:deleteChannel`, `admin:setTitle`, `admin:setPassword` | request | configuration |
| `admin:publish` `{ channelId }`, `admin:produce`, `admin:stopPublish` | request | sending from a browser; `admin:stopPublish` also stops a server capture |
| `admin:devices` | request | `{ devices: [{ id, name, inputs }] }`, or `ffmpeg_missing` |
| `admin:startCapture` `{ channelId, device, input }` | request | sending from an audio input of the server |
| `admin:levels` | server → admins | `{ <channelId>: 0..1 }` peak levels of server captures, 10 per second |
| `admin:reload` `{ channelId }` | request | reloads the listener pages of a channel |
| `admin:stats` `{ channelId, days }` | request | per-day and per-weekday averages |
| `admin:loggedOut` | server → socket | a password was set; the socket lost admin rights |

## Data

Stored in `DATA_DIR` (default `data/`, installers use `/opt/ecg-stream/data` or `%ProgramData%\ecg-stream`):

- `config.json` – `{ title, channels: [{ id, name, language, source?: { device, input, inputs, live } }], auth: { hash, secret } | null }`.
  The password is hashed with scrypt; `secret` signs session tokens and is rotated with every password change.
- `stats.json` – `{ days: { "YYYY-MM-DD": { <channelId> | "*": { name, n, m, sum, max } } } }`.
  One sample per minute for every live channel (`*` = sum of all live channels); `n` = live minutes, `m` = minutes with
  at least one listener. Averages are `round(sum / m)`, i.e. whole listeners over the minutes anyone listened
  (entries written before `m` existed fall back to `n`; any day with a listener shows at least 1). Weekday averages are the rounded mean of the daily averages. 400 days are kept; the file is written every 5 minutes and on shutdown.

`node server/index.js --set-password` changes the password from the command line (stop the service first).

The announced media address is `IP` or the first physical LAN IPv4 address; at boot the server waits up to 60 s for one.
The admin settings show it as the listener address (never a loopback address).

## Security model

- Intended for local networks. HTTP only; use a reverse proxy for HTTPS or external access.
- Browsers allow microphone capture only in a secure context, so sending from a browser works on `localhost` or via HTTPS. Server capture works over plain HTTP: the admin only sends start/stop; device ids and inputs are checked against the device list and passed to ffmpeg as separate arguments (no shell). Listeners never see `source`.
- Without a password every client may use the admin events (as before version 2). With a password, admin events are
  rejected unless the socket logged in or presented a valid token. Logins are limited to 5 attempts per minute and client
  address (counted before the password check, so parallel guesses are limited too; behind a reverse proxy all clients share one address).
- Only `socket.io/client-dist` is served from `node_modules`. Responses carry a restrictive CSP and `nosniff`/`DENY` headers.
- Channel names are length-limited, languages are whitelisted, rendering uses `textContent` only.

## Installers

`installer/install.sh` (Linux, macOS) and `installer/install.ps1` (Windows) download the app (or use the local copy),
install a private Node.js (checksum-verified) next to it, install ffmpeg (Linux: apt/dnf; macOS: ffmpeg.martin-riedl.de, Windows:
gyan.dev essentials, both checksum-verified against the published `.sha256` and only re-downloaded when it changes),
run `npm ci --omit=dev`, register a service and open the
firewall for `PORT` and `RTC_PORT`. Running them again updates the installation and keeps `DATA_DIR`.

## Tests

`npm test` runs `node --test` on `test/`: unit tests for validation, statistics, passwords/tokens and IP detection, and
an integration test that starts a real server (mediasoup included) and drives it with the socket.io client. The capture
test uses an ffmpeg `lavfi` test tone instead of a device and is skipped without ffmpeg.
WebRTC media itself is verified manually in a browser (admin page + listener page).
