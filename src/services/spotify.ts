import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname, resolve } from "path";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const SPOTIFY_ACCOUNTS_BASE = "https://accounts.spotify.com";
const DEFAULT_TOKEN_FILE = "data/spotify-token.json";

// Minimum scopes required for display API features
export const SPOTIFY_SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");

export class SpotifyApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: string,
  ) {
    super(message);
    this.name = "SpotifyApiError";
  }
}

// Spotify API response types
type SpotifyImage = {
  url: string;
  height: number | null;
  width: number | null;
};

type SpotifyArtist = {
  id: string;
  name: string;
  uri: string;
};

type SpotifyAlbum = {
  id: string;
  name: string;
  images: SpotifyImage[];
  uri: string;
};

export type SpotifyTrack = {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  duration_ms: number;
  uri: string;
  external_urls: {
    spotify: string;
  };
};

export type SpotifyDevice = {
  id: string | null;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
  supports_volume: boolean;
};

type SpotifyCurrentlyPlayingResponse = {
  device: SpotifyDevice;
  shuffle_state: boolean;
  repeat_state: string;
  timestamp: number;
  context: unknown | null;
  progress_ms: number | null;
  item: SpotifyTrack | null;
  currently_playing_type: string;
  is_playing: boolean;
};

type SpotifyDevicesResponse = {
  devices: SpotifyDevice[];
};

export type SpotifyQueueResponse = {
  currently_playing: SpotifyTrack | null;
  queue: SpotifyTrack[];
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

type TokenState = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

let tokenState: TokenState | null = null;
let pendingOAuthState: string | null = null;
let hasLoadedTokenState = false;

function getTokenFilePath(): string {
  if (process.env.SPOTIFY_TOKEN_FILE?.trim()) {
    return resolve(process.env.SPOTIFY_TOKEN_FILE);
  }

  if (process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim()) {
    return resolve(
      process.env.RAILWAY_VOLUME_MOUNT_PATH,
      "spotify-token.json",
    );
  }

  return resolve(DEFAULT_TOKEN_FILE);
}

function parseTokenState(value: unknown): TokenState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybeTokenState = value as Partial<TokenState>;
  if (typeof maybeTokenState.refreshToken !== "string") {
    return null;
  }

  return {
    accessToken:
      typeof maybeTokenState.accessToken === "string"
        ? maybeTokenState.accessToken
        : "",
    refreshToken: maybeTokenState.refreshToken,
    expiresAt:
      typeof maybeTokenState.expiresAt === "number"
        ? maybeTokenState.expiresAt
        : 0,
  };
}

async function loadTokenStateFromFile(): Promise<void> {
  if (tokenState || hasLoadedTokenState) {
    return;
  }

  hasLoadedTokenState = true;
  const tokenFile = getTokenFilePath();

  try {
    const json = await readFile(tokenFile, "utf8");
    tokenState = parseTokenState(JSON.parse(json));
    if (!tokenState) {
      console.warn(`Spotify token file is invalid: ${tokenFile}`);
    }
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }

    console.warn(`Failed to read Spotify token file: ${tokenFile}`, error);
  }
}

async function saveTokenStateToFile(): Promise<void> {
  if (!tokenState) {
    return;
  }

  const tokenFile = getTokenFilePath();
  const tempFile = `${tokenFile}.${randomUUID()}.tmp`;

  await mkdir(dirname(tokenFile), { recursive: true });
  await writeFile(
    tempFile,
    `${JSON.stringify(tokenState, null, 2)}\n`,
    "utf8",
  );
  await rename(tempFile, tokenFile);
}

export function isAuthorized(): boolean {
  return tokenState !== null;
}

export function generateAuthUrl(clientId: string, redirectUri: string): string {
  const state = randomUUID();
  pendingOAuthState = state;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SPOTIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
  });

  return `${SPOTIFY_ACCOUNTS_BASE}/authorize?${params.toString()}`;
}

export function validateOAuthState(state: string): boolean {
  if (!pendingOAuthState || pendingOAuthState !== state) {
    return false;
  }
  pendingOAuthState = null;
  return true;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<void> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new SpotifyApiError(
      response.status,
      `Token exchange failed: ${response.statusText}`,
      text.slice(0, 1000),
    );
  }

  const data = (await response.json()) as TokenResponse;
  if (!data.refresh_token) {
    throw new SpotifyApiError(
      502,
      "Spotify did not return a refresh token",
      "",
    );
  }

  tokenState = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  await saveTokenStateToFile();
}

async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<void> {
  if (!tokenState) {
    throw new Error("No token state to refresh");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokenState.refreshToken,
  });

  const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new SpotifyApiError(
      response.status,
      `Token refresh failed: ${response.statusText}`,
      text.slice(0, 1000),
    );
  }

  const data = (await response.json()) as TokenResponse;

  tokenState = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? tokenState.refreshToken,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  await saveTokenStateToFile();
}

async function getValidAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  await loadTokenStateFromFile();

  if (!tokenState) {
    throw new SpotifyApiError(
      401,
      "Not authorized with Spotify. Visit /auth/spotify/login to connect.",
      "",
    );
  }

  if (Date.now() >= tokenState.expiresAt) {
    await refreshAccessToken(clientId, clientSecret);
  }

  return tokenState!.accessToken;
}

async function spotifyFetch(
  path: string,
  options: RequestInit,
  clientId: string,
  clientSecret: string,
  retryCount = 0,
): Promise<Response> {
  const accessToken = await getValidAccessToken(clientId, clientSecret);

  const response = await fetch(`${SPOTIFY_API_BASE}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 429 && retryCount < 3) {
    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfterSeconds = retryAfterHeader
      ? parseInt(retryAfterHeader, 10)
      : 1;
    await new Promise((resolve) =>
      setTimeout(resolve, retryAfterSeconds * 1000),
    );
    return spotifyFetch(path, options, clientId, clientSecret, retryCount + 1);
  }

  return response;
}

export async function getCurrentlyPlaying(
  clientId: string,
  clientSecret: string,
): Promise<SpotifyCurrentlyPlayingResponse | null> {
  const response = await spotifyFetch(
    "/me/player/currently-playing",
    { method: "GET" },
    clientId,
    clientSecret,
  );

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new SpotifyApiError(
      response.status,
      `Failed to get currently playing: ${response.statusText}`,
      text.slice(0, 1000),
    );
  }

  return response.json() as Promise<SpotifyCurrentlyPlayingResponse>;
}

export async function getDevices(
  clientId: string,
  clientSecret: string,
): Promise<SpotifyDevicesResponse> {
  const response = await spotifyFetch(
    "/me/player/devices",
    { method: "GET" },
    clientId,
    clientSecret,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new SpotifyApiError(
      response.status,
      `Failed to get devices: ${response.statusText}`,
      text.slice(0, 1000),
    );
  }

  return response.json() as Promise<SpotifyDevicesResponse>;
}

export async function transferPlayback(
  deviceId: string,
  play: boolean,
  clientId: string,
  clientSecret: string,
): Promise<void> {
  const response = await spotifyFetch(
    "/me/player",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_ids: [deviceId], play }),
    },
    clientId,
    clientSecret,
  );

  if (response.status !== 204) {
    const text = await response.text();
    throw new SpotifyApiError(
      response.status,
      `Failed to transfer playback: ${response.statusText}`,
      text.slice(0, 1000),
    );
  }
}

export async function resumePlayback(
  clientId: string,
  clientSecret: string,
  deviceId?: string,
): Promise<void> {
  const path = deviceId
    ? `/me/player/play?device_id=${encodeURIComponent(deviceId)}`
    : "/me/player/play";
  const response = await spotifyFetch(
    path,
    { method: "PUT" },
    clientId,
    clientSecret,
  );

  if (response.status !== 204) {
    const text = await response.text();
    throw new SpotifyApiError(
      response.status,
      `Failed to resume playback: ${response.statusText}`,
      text.slice(0, 1000),
    );
  }
}

export async function pausePlayback(
  clientId: string,
  clientSecret: string,
  deviceId?: string,
): Promise<void> {
  const path = deviceId
    ? `/me/player/pause?device_id=${encodeURIComponent(deviceId)}`
    : "/me/player/pause";
  const response = await spotifyFetch(
    path,
    { method: "PUT" },
    clientId,
    clientSecret,
  );

  if (response.status !== 204) {
    const text = await response.text();
    throw new SpotifyApiError(
      response.status,
      `Failed to pause playback: ${response.statusText}`,
      text.slice(0, 1000),
    );
  }
}

export async function skipToNext(
  clientId: string,
  clientSecret: string,
  deviceId?: string,
): Promise<void> {
  const path = deviceId
    ? `/me/player/next?device_id=${encodeURIComponent(deviceId)}`
    : "/me/player/next";
  const response = await spotifyFetch(
    path,
    { method: "POST" },
    clientId,
    clientSecret,
  );

  if (response.status !== 204) {
    const text = await response.text();
    throw new SpotifyApiError(
      response.status,
      `Failed to skip to next: ${response.statusText}`,
      text.slice(0, 1000),
    );
  }
}

export async function skipToPrevious(
  clientId: string,
  clientSecret: string,
  deviceId?: string,
): Promise<void> {
  const path = deviceId
    ? `/me/player/previous?device_id=${encodeURIComponent(deviceId)}`
    : "/me/player/previous";
  const response = await spotifyFetch(
    path,
    { method: "POST" },
    clientId,
    clientSecret,
  );

  if (response.status !== 204) {
    const text = await response.text();
    throw new SpotifyApiError(
      response.status,
      `Failed to skip to previous: ${response.statusText}`,
      text.slice(0, 1000),
    );
  }
}

export async function seekToPosition(
  positionMs: number,
  clientId: string,
  clientSecret: string,
  deviceId?: string,
): Promise<void> {
  let path = `/me/player/seek?position_ms=${positionMs}`;
  if (deviceId) {
    path += `&device_id=${encodeURIComponent(deviceId)}`;
  }
  const response = await spotifyFetch(
    path,
    { method: "PUT" },
    clientId,
    clientSecret,
  );

  if (response.status !== 204) {
    const text = await response.text();
    throw new SpotifyApiError(
      response.status,
      `Failed to seek: ${response.statusText}`,
      text.slice(0, 1000),
    );
  }
}

export async function getQueue(
  clientId: string,
  clientSecret: string,
): Promise<SpotifyQueueResponse> {
  const response = await spotifyFetch(
    "/me/player/queue",
    { method: "GET" },
    clientId,
    clientSecret,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new SpotifyApiError(
      response.status,
      `Failed to get queue: ${response.statusText}`,
      text.slice(0, 1000),
    );
  }

  return response.json() as Promise<SpotifyQueueResponse>;
}
