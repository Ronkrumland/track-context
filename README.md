# track-context

`track-context` is an API layer for various apps. It exposes current
listening context for chat and display clients, and it acts as the Spotify
playback bridge for the companion `listening-room` app.

The service currently combines two related jobs:

- Last.fm listening context for "what am I listening to?" prompts.
- Spotify OAuth, now-playing display data, queue/device reads, and transport
  controls for a private fullscreen player.

The goal is a small, single-user music service that can power ambient displays,
AI chat context, and future music-aware workflows without leaking provider
tokens into frontend code.

## Current Features

- Bearer-token protected API for all non-health endpoints.
- CORS allowlist support for local and deployed clients.
- Last.fm endpoints for recent tracks and now-playing-or-most-recent context.
- Spotify OAuth login flow with token refresh and file-backed persistence.
- Spotify display API for album art, title, artist, album, progress, duration,
  playback state, Spotify track URL, and the next queued track.
- Spotify playback controls for play, pause, next, previous, seek, and device
  transfer.
- Static helper UI in `public/` for loading Last.fm context and copying it into
  AI chat prompts.
- Railway-friendly token storage through `RAILWAY_VOLUME_MOUNT_PATH`.

## API Surface

All endpoints except `/health` and `/auth/spotify/callback` require:

```http
Authorization: Bearer <API_AUTH_TOKEN>
```

Core endpoints:

- `GET /health`
- `GET /auth/check`
- `GET /recent-tracks`
- `GET /now-playing`
- `GET /auth/spotify/login`
- `GET /auth/spotify/login-url`
- `GET /display/now-playing`
- `GET /display/devices`
- `GET /display/queue`
- `POST /display/play`
- `POST /display/pause`
- `POST /display/next`
- `POST /display/previous`
- `PUT /display/seek`
- `PUT /display/device`

## Environment

Create a `.env` file from `.env.example`:

```env
PORT=3000
LASTFM_API_KEY=
LASTFM_USERNAME=
API_AUTH_TOKEN=your-token-here
ALLOWED_CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://[::1]:5173
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/auth/spotify/callback
SPOTIFY_TOKEN_FILE=
```

For local Spotify OAuth, register this exact redirect URI in the Spotify
developer dashboard:

```txt
http://127.0.0.1:3000/auth/spotify/callback
```

Spotify does not allow `localhost` redirect URIs. Use the explicit loopback IP
address for local development, and make sure `SPOTIFY_REDIRECT_URI` matches it.

Configure allowed browser clients with a comma-separated
`ALLOWED_CORS_ORIGINS` value. Loopback origins are expanded across
`localhost`, `127.0.0.1`, and `[::1]` for the same port.

## Run

```bash
npm install
npm run dev
```

Build and run the compiled server:

```bash
npm run build
npm start
```

## Spotify Token Persistence

Spotify OAuth tokens are stored in a JSON file so the API can survive restarts
without requiring a fresh Spotify authorization.

On Railway, attach a volume to the API service at `/app/data`. Railway provides
`RAILWAY_VOLUME_MOUNT_PATH`, and the app will store tokens at:

```txt
$RAILWAY_VOLUME_MOUNT_PATH/spotify-token.json
```

Set `SPOTIFY_TOKEN_FILE` only if you want to override that location. For local
development, the fallback path is `data/spotify-token.json`, which is ignored by
git.

## Direction

Near-term work should keep the service boring and reliable: clearer Spotify
authorization status, better empty-state responses, tighter endpoint
documentation, and enough display data for richer clients without expanding
into a general Spotify clone.

Future capabilities are likely to center on:

- Real-time display updates, probably after the polling client is stable.
- More complete playback/device controls where Spotify Premium allows them.
- Better prompt-ready listening summaries built from Last.fm history.
- Support for richer display modes in `listening-room`.
- Deployment hardening for a long-running personal music appliance.
