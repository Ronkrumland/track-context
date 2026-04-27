import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import dotenv from "dotenv";
import {
  getNowPlayingOrRecentTrack,
  getRecentTracks,
  LastfmApiError,
} from "./services/lastfm.js";
import {
  SpotifyAuthManager,
  SpotifyApiError,
} from "./services/spotify.js";
import { createDisplayRouter } from "./display/display.router.js";

dotenv.config();

const app = express();
const allowedCorsOriginsEnv =
  process.env.ALLOWED_CORS_ORIGINS ?? process.env.ALLOWED_CORS_ORIGIN;

function parseAllowedCorsOrigins(value: string | undefined): Set<string> {
  if (!value) {
    return new Set();
  }

  const origins = new Set(
    value
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );

  for (const origin of [...origins]) {
    try {
      const url = new URL(origin);
      const isLoopback =
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]";

      if (isLoopback) {
        for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
          const alias = new URL(origin);
          alias.hostname = hostname;
          origins.add(alias.origin);
        }
      }
    } catch {
      // Ignore malformed origins so the explicit config check can fail normally.
    }
  }

  return origins;
}

const allowedCorsOrigins = parseAllowedCorsOrigins(allowedCorsOriginsEnv);

app.use(helmet());
app.use((req, res, next) => {
  const origin = req.header("origin")?.replace(/\/$/, "");

  if (origin && allowedCorsOrigins.has(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  }

  if (req.method === "OPTIONS") {
    if (origin && allowedCorsOrigins.has(origin)) {
      res.sendStatus(204);
      return;
    }

    res.sendStatus(403);
    return;
  }

  next();
});
app.set("trust proxy", 1);
app.use(express.static("public"));
app.use(express.json());
const port = Number(process.env.PORT) || 3000;
const lastfmApiKey = process.env.LASTFM_API_KEY;
const lastfmUsername = process.env.LASTFM_USERNAME;
const apiAuthToken = process.env.API_AUTH_TOKEN;
const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const spotifyRedirectUri = process.env.SPOTIFY_REDIRECT_URI;

if (
  !lastfmApiKey ||
  !lastfmUsername ||
  !apiAuthToken ||
  allowedCorsOrigins.size === 0 ||
  !spotifyClientId ||
  !spotifyClientSecret ||
  !spotifyRedirectUri
) {
  console.error(
    "Invalid configuration: LASTFM_API_KEY, LASTFM_USERNAME, API_AUTH_TOKEN, ALLOWED_CORS_ORIGINS, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI are required.",
  );
  process.exit(1);
}

const auth = new SpotifyAuthManager(
  spotifyClientId,
  spotifyClientSecret,
  spotifyRedirectUri,
);

function handleServerError(
  context: string,
  error: unknown,
  res: express.Response,
): void {
  if (error instanceof LastfmApiError) {
    console.error(`[${context}] Last.fm API error`, {
      message: error.message,
      status: error.status,
      statusText: error.statusText,
      responseBody: error.responseBody,
    });
  } else {
    console.error(`[${context}] Internal error`, error);
  }

  res.status(500).json({ error: "Internal server error" });
}

app.use((req, res, next) => {
  if (req.path === "/health" || req.path === "/auth/spotify/callback") {
    next();
    return;
  }

  const authHeader = req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice("Bearer ".length);
  if (token !== apiAuthToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
});

app.get("/auth/check", (_req, res) => {
  res.json({ status: "ok" });
});

const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/health",
  message: { error: "Too many requests" },
});

app.use(apiRateLimiter);
app.use("/display", createDisplayRouter(auth));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/auth/spotify/login", (_req, res) => {
  const authUrl = auth.generateAuthUrl();
  res.redirect(authUrl);
});

app.get("/auth/spotify/login-url", (_req, res) => {
  const authUrl = auth.generateAuthUrl();
  res.json({ url: authUrl });
});

app.get("/auth/spotify/callback", async (req, res) => {
  const { code, state, error } = req.query as {
    code?: string;
    state?: string;
    error?: string;
  };

  if (error) {
    res.status(400).json({ error: `Spotify authorization denied: ${error}` });
    return;
  }

  if (!code || !state) {
    res.status(400).json({ error: "Missing code or state parameter" });
    return;
  }

  if (!auth.validateOAuthState(state)) {
    res.status(400).json({ error: "Invalid or expired state parameter" });
    return;
  }

  try {
    await auth.exchangeCodeForTokens(code);
    res.json({ status: "authorized" });
  } catch (err) {
    if (err instanceof SpotifyApiError) {
      console.error("[GET /auth/spotify/callback] Token exchange error", {
        status: err.status,
        message: err.message,
        body: err.body,
      });
    } else {
      console.error("[GET /auth/spotify/callback] Internal error", err);
    }
    res.status(500).json({ error: "Failed to complete Spotify authorization" });
  }
});

app.get("/recent-tracks", async (_req, res) => {
  try {
    const tracks = await getRecentTracks(lastfmApiKey, lastfmUsername);
    if (tracks.length === 0) {
      res.status(404).json({ error: "No tracks found" });
      return;
    }

    res.json({ tracks });
  } catch (error) {
    handleServerError("GET /recent-tracks", error, res);
  }
});

app.get("/now-playing", async (_req, res) => {
  try {
    const track = await getNowPlayingOrRecentTrack(
      lastfmApiKey,
      lastfmUsername,
    );
    if (!track) {
      res.status(404).json({ error: "No tracks found" });
      return;
    }

    res.json({ track });
  } catch (error) {
    handleServerError("GET /now-playing", error, res);
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`LASTFM_API_KEY configured: ${Boolean(lastfmApiKey)}`);
  console.log(`LASTFM_USERNAME configured: ${Boolean(lastfmUsername)}`);
  console.log(`API_AUTH_TOKEN configured: ${Boolean(apiAuthToken)}`);
  console.log(`ALLOWED_CORS_ORIGINS configured: ${allowedCorsOrigins.size}`);
  console.log(`SPOTIFY_CLIENT_ID configured: ${Boolean(spotifyClientId)}`);
  console.log(`SPOTIFY_CLIENT_SECRET configured: ${Boolean(spotifyClientSecret)}`);
  console.log(`SPOTIFY_REDIRECT_URI configured: ${Boolean(spotifyRedirectUri)}`);
});

auth.initialize().catch((err) => {
  console.error("Failed to initialize Spotify auth:", err);
});
