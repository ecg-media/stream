# Architecture

Developer notes for the stream server. User documentation is in the [README](../README.md) (German).

## Overview

```
Admin browser (publish.html)  --WebRTC send-->  mediasoup router  --WebRTC recv-->  Listener browsers (index.html)
            \__________ socket.io signalling (server/index.js) __________/
```

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
- `WebRtcServer` multiplexes all transports on `RTC_PORT` (UDP preferred, TCP fallback).

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
| `admin:publish` `{ channelId }`, `admin:produce`, `admin:stopPublish` | request | sending |
| `admin:reload` `{ channelId }` | request | reloads the listener pages of a channel |
| `admin:stats` `{ channelId, days }` | request | per-day and per-weekday averages |
| `admin:loggedOut` | server → socket | a password was set; the socket lost admin rights |

## Data

Stored in `DATA_DIR` (default `data/`, installers use `/opt/ecg-stream/data` or `%ProgramData%\ecg-stream`):

- `config.json` – `{ title, channels: [{ id, name, language }], auth: { hash, secret } | null }`.
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
- Browsers allow microphone capture only in a secure context, so sending works on `localhost` or via HTTPS.
- Without a password every client may use the admin events (as before version 2). With a password, admin events are
  rejected unless the socket logged in or presented a valid token. Logins are limited to 5 attempts per minute and client
  address (counted before the password check, so parallel guesses are limited too; behind a reverse proxy all clients share one address).
- Only `socket.io/client-dist` is served from `node_modules`. Responses carry a restrictive CSP and `nosniff`/`DENY` headers.
- Channel names are length-limited, languages are whitelisted, rendering uses `textContent` only.

## Installers

`installer/install.sh` (Linux, macOS) and `installer/install.ps1` (Windows) download the app (or use the local copy),
install a private Node.js (checksum-verified) next to it, run `npm ci --omit=dev`, register a service and open the
firewall for `PORT` and `RTC_PORT`. Running them again updates the installation and keeps `DATA_DIR`.

## Tests

`npm test` runs `node --test` on `test/`: unit tests for validation, statistics, passwords/tokens and IP detection, and
an integration test that starts a real server (mediasoup included) and drives it with the socket.io client.
WebRTC media itself is verified manually in a browser (admin page + listener page).
