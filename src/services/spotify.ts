import { exec } from "child_process";
import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname, resolve } from "path";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const SPOTIFY_ACCOUNTS_BASE = "https://accounts.spotify.com";
const DEFAULT_TOKEN_FILE = "data/spotify-token.json";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

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

export type SpotifyCurrentlyPlayingResponse = {
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

export type SpotifyDevicesResponse = {
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
  clientId?: string;
};

function getTokenFilePath(): string {
  if (process.env.SPOTIFY_TOKEN_FILE?.trim()) {
    return resolve(process.env.SPOTIFY_TOKEN_FILE);
  }
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim()) {
    return resolve(process.env.RAILWAY_VOLUME_MOUNT_PATH, "spotify-token.json");
  }
  return resolve(DEFAULT_TOKEN_FILE);
}

function parseTokenState(value: unknown, clientId: string): TokenState | null {
  if (!value || typeof value !== "object") return null;

  const maybe = value as Partial<TokenState>;
  if (typeof maybe.refreshToken !== "string") return null;

  if (typeof maybe.clientId === "string" && maybe.clientId !== clientId) {
    return null;
  }

  return {
    accessToken: typeof maybe.accessToken === "string" ? maybe.accessToken : "",
    refreshToken: maybe.refreshToken,
    expiresAt: typeof maybe.expiresAt === "number" ? maybe.expiresAt : 0,
    clientId,
  };
}

function isENOENT(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "ENOENT"
  );
}

function isInvalidStoredTokenResponse(body: string): boolean {
  try {
    const data = JSON.parse(body) as { error?: unknown };
    return data.error === "invalid_client" || data.error === "invalid_grant";
  } catch {
    return false;
  }
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.warn("Could not auto-open browser:", err.message);
  });
}

export class SpotifyAuthManager {
  private tokenState: TokenState | null = null;
  private readonly pendingOAuthStates = new Set<string>();
  private refreshPromise: Promise<void> | null = null;
  private readonly tokenFilePath: string;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
  ) {
    this.tokenFilePath = getTokenFilePath();
  }

  async initialize(): Promise<void> {
    await this.loadTokenFromFile();

    if (!this.tokenState) {
      const authUrl = this.generateAuthUrl();
      console.log("\nSpotify not connected. Opening browser to authorize...");
      console.log(`If the browser did not open, visit:\n  ${authUrl}\n`);
      openBrowser(authUrl);
    } else {
      console.log("Spotify: token loaded from file.");
    }
  }

  isAuthorized(): boolean {
    return this.tokenState !== null;
  }

  generateAuthUrl(): string {
    const state = randomUUID();
    this.pendingOAuthStates.add(state);
    setTimeout(() => this.pendingOAuthStates.delete(state), OAUTH_STATE_TTL_MS);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      scope: SPOTIFY_SCOPES,
      redirect_uri: this.redirectUri,
      state,
    });

    return `${SPOTIFY_ACCOUNTS_BASE}/authorize?${params.toString()}`;
  }

  validateOAuthState(state: string): boolean {
    if (!this.pendingOAuthStates.has(state)) return false;
    this.pendingOAuthStates.delete(state);
    return true;
  }

  async exchangeCodeForTokens(code: string): Promise<void> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.redirectUri,
    });

    const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
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
      throw new SpotifyApiError(502, "Spotify did not return a refresh token", "");
    }

    this.tokenState = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
      clientId: this.clientId,
    };
    await this.saveTokenToFile();
  }

  private async loadTokenFromFile(): Promise<void> {
    try {
      const json = await readFile(this.tokenFilePath, "utf8");
      const parsed = parseTokenState(JSON.parse(json), this.clientId);
      if (parsed) {
        this.tokenState = parsed;
      } else {
        console.warn(`Spotify token file is invalid: ${this.tokenFilePath}`);
      }
    } catch (error) {
      if (isENOENT(error)) return;
      console.warn(`Failed to read Spotify token file: ${this.tokenFilePath}`, error);
    }
  }

  private async saveTokenToFile(): Promise<void> {
    if (!this.tokenState) return;
    const tempFile = `${this.tokenFilePath}.${randomUUID()}.tmp`;
    await mkdir(dirname(this.tokenFilePath), { recursive: true });
    await writeFile(tempFile, `${JSON.stringify(this.tokenState, null, 2)}\n`, "utf8");
    await rename(tempFile, this.tokenFilePath);
  }

  private async refreshToken(): Promise<void> {
    if (!this.tokenState) throw new Error("No token state to refresh");

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.tokenState.refreshToken,
    });

    const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      if (isInvalidStoredTokenResponse(text)) {
        this.tokenState = null;
        throw new SpotifyApiError(
          401,
          "Spotify authorization expired or no longer matches this app. Reconnect Spotify to continue.",
          text.slice(0, 1000),
        );
      }
      throw new SpotifyApiError(
        response.status,
        `Token refresh failed: ${response.statusText}`,
        text.slice(0, 1000),
      );
    }

    const data = (await response.json()) as TokenResponse;
    this.tokenState = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? this.tokenState.refreshToken,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
      clientId: this.clientId,
    };
    await this.saveTokenToFile();
  }

  private async getAccessToken(): Promise<string> {
    if (!this.tokenState) {
      throw new SpotifyApiError(
        401,
        "Not authorized with Spotify. Visit /auth/spotify/login to connect.",
        "",
      );
    }

    if (Date.now() >= this.tokenState.expiresAt) {
      this.refreshPromise ??= this.refreshToken().finally(() => {
        this.refreshPromise = null;
      });
      await this.refreshPromise;
    }

    return this.tokenState!.accessToken;
  }

  private async spotifyFetch(
    path: string,
    options: RequestInit,
    retryCount = 0,
  ): Promise<Response> {
    const accessToken = await this.getAccessToken();

    const response = await fetch(`${SPOTIFY_API_BASE}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status === 429 && retryCount < 3) {
      const retryAfter = response.headers.get("Retry-After");
      const delayMs = (retryAfter ? parseInt(retryAfter, 10) : 1) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return this.spotifyFetch(path, options, retryCount + 1);
    }

    return response;
  }

  async getCurrentlyPlaying(): Promise<SpotifyCurrentlyPlayingResponse | null> {
    const response = await this.spotifyFetch("/me/player/currently-playing", {
      method: "GET",
    });

    if (response.status === 204) return null;

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

  async getDevices(): Promise<SpotifyDevicesResponse> {
    const response = await this.spotifyFetch("/me/player/devices", {
      method: "GET",
    });

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

  async getQueue(): Promise<SpotifyQueueResponse> {
    const response = await this.spotifyFetch("/me/player/queue", {
      method: "GET",
    });

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

  async transferPlayback(deviceId: string, play: boolean): Promise<void> {
    const response = await this.spotifyFetch("/me/player", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_ids: [deviceId], play }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new SpotifyApiError(
        response.status,
        `Failed to transfer playback: ${response.statusText}`,
        text.slice(0, 1000),
      );
    }
  }

  async resumePlayback(deviceId?: string): Promise<void> {
    const path = deviceId
      ? `/me/player/play?device_id=${encodeURIComponent(deviceId)}`
      : "/me/player/play";
    const response = await this.spotifyFetch(path, { method: "PUT" });

    if (!response.ok) {
      const text = await response.text();
      throw new SpotifyApiError(
        response.status,
        `Failed to resume playback: ${response.statusText}`,
        text.slice(0, 1000),
      );
    }
  }

  async pausePlayback(deviceId?: string): Promise<void> {
    const path = deviceId
      ? `/me/player/pause?device_id=${encodeURIComponent(deviceId)}`
      : "/me/player/pause";
    const response = await this.spotifyFetch(path, { method: "PUT" });

    if (!response.ok) {
      const text = await response.text();
      throw new SpotifyApiError(
        response.status,
        `Failed to pause playback: ${response.statusText}`,
        text.slice(0, 1000),
      );
    }
  }

  async skipToNext(deviceId?: string): Promise<void> {
    const path = deviceId
      ? `/me/player/next?device_id=${encodeURIComponent(deviceId)}`
      : "/me/player/next";
    const response = await this.spotifyFetch(path, { method: "POST" });

    if (!response.ok) {
      const text = await response.text();
      throw new SpotifyApiError(
        response.status,
        `Failed to skip to next: ${response.statusText}`,
        text.slice(0, 1000),
      );
    }
  }

  async skipToPrevious(deviceId?: string): Promise<void> {
    const path = deviceId
      ? `/me/player/previous?device_id=${encodeURIComponent(deviceId)}`
      : "/me/player/previous";
    const response = await this.spotifyFetch(path, { method: "POST" });

    if (!response.ok) {
      const text = await response.text();
      throw new SpotifyApiError(
        response.status,
        `Failed to skip to previous: ${response.statusText}`,
        text.slice(0, 1000),
      );
    }
  }

  async seekToPosition(positionMs: number, deviceId?: string): Promise<void> {
    let path = `/me/player/seek?position_ms=${positionMs}`;
    if (deviceId) path += `&device_id=${encodeURIComponent(deviceId)}`;
    const response = await this.spotifyFetch(path, { method: "PUT" });

    if (!response.ok) {
      const text = await response.text();
      throw new SpotifyApiError(
        response.status,
        `Failed to seek: ${response.statusText}`,
        text.slice(0, 1000),
      );
    }
  }
}
