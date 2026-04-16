import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import dotenv from "dotenv";
import {
  getNowPlayingOrRecentTrack,
  getRecentTracks,
  LastfmApiError,
} from "./services/lastfm.js";
import { displayRouter } from "./display/display.router.js";

dotenv.config();

const app = express();
const allowedCorsOriginsEnv =
  process.env.ALLOWED_CORS_ORIGINS ?? process.env.ALLOWED_CORS_ORIGIN;

function parseAllowedCorsOrigins(value: string | undefined): Set<string> {
  if (!value) {
    return new Set();
  }

  return new Set(
    value
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
}

const allowedCorsOrigins = parseAllowedCorsOrigins(allowedCorsOriginsEnv);

app.use(helmet());
app.use((req, res, next) => {
  const origin = req.header("origin")?.replace(/\/$/, "");

  if (origin && allowedCorsOrigins.has(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.header("Access-Control-Allow-Methods", "GET,OPTIONS");
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
const port = Number(process.env.PORT) || 3000;
const lastfmApiKey = process.env.LASTFM_API_KEY;
const lastfmUsername = process.env.LASTFM_USERNAME;
const apiAuthToken = process.env.API_AUTH_TOKEN;

if (
  !lastfmApiKey ||
  !lastfmUsername ||
  !apiAuthToken ||
  allowedCorsOrigins.size === 0
) {
  console.error(
    "Invalid configuration: LASTFM_API_KEY, LASTFM_USERNAME, API_AUTH_TOKEN, and ALLOWED_CORS_ORIGINS are required.",
  );
  process.exit(1);
}

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
  if (req.path === "/health") {
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

const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/health",
  message: { error: "Too many requests" },
});

app.use(apiRateLimiter);
app.use("/display", displayRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
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
});
