# track-context

TrackContext is a tiny service that provides music listening context for AI chat workflows, starting with Last.fm now-playing and recent-track data.

Configure allowed CORS origins with a comma-separated `ALLOWED_CORS_ORIGINS`
value in `.env`, for example:

```env
ALLOWED_CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://[::1]:5173,https://example.com
```

For local Spotify OAuth, register this exact redirect URI in the Spotify
developer dashboard:

```txt
http://127.0.0.1:3000/auth/spotify/callback
```

Spotify does not allow `localhost` redirect URIs. Use the explicit loopback IP
address for local development, and make sure `SPOTIFY_REDIRECT_URI` matches it.

## Spotify token persistence

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
