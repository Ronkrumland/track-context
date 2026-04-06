import { Router } from "express";
import type { Request, Response } from "express";
import {
  getNowPlaying,
  getAvailableDevices,
  getPlaybackQueue,
} from "./display.service.js";
import {
  resumePlayback,
  pausePlayback,
  skipToNext,
  skipToPrevious,
  seekToPosition,
  transferPlayback,
  SpotifyApiError,
} from "../services/spotify.js";

const displayRouter = Router();

const clientId = process.env.SPOTIFY_CLIENT_ID!;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;

function handleSpotifyError(
  context: string,
  error: unknown,
  res: Response,
): void {
  if (error instanceof SpotifyApiError) {
    if (error.status === 401) {
      res.status(401).json({ error: error.message });
      return;
    }
    if (error.status === 403) {
      res
        .status(403)
        .json({ error: "Spotify Premium required for playback control." });
      return;
    }
    if (error.status === 404) {
      res.status(404).json({ error: "No active Spotify device found." });
      return;
    }
    console.error(`[${context}] Spotify API error`, {
      status: error.status,
      message: error.message,
      body: error.body,
    });
    res.status(502).json({ error: "Spotify API error" });
    return;
  }
  console.error(`[${context}] Internal error`, error);
  res.status(500).json({ error: "Internal server error" });
}

displayRouter.get("/now-playing", async (_req: Request, res: Response) => {
  try {
    const response = await getNowPlaying(clientId, clientSecret);
    if (!response) {
      res.status(204).send();
      return;
    }
    res.json(response);
  } catch (error) {
    handleSpotifyError("GET /display/now-playing", error, res);
  }
});

displayRouter.get("/devices", async (_req: Request, res: Response) => {
  try {
    const response = await getAvailableDevices(clientId, clientSecret);
    res.json(response);
  } catch (error) {
    handleSpotifyError("GET /display/devices", error, res);
  }
});

displayRouter.get("/queue", async (_req: Request, res: Response) => {
  try {
    const response = await getPlaybackQueue(clientId, clientSecret);
    res.json(response);
  } catch (error) {
    handleSpotifyError("GET /display/queue", error, res);
  }
});

displayRouter.post("/play", async (_req: Request, res: Response) => {
  try {
    await resumePlayback(clientId, clientSecret);
    res.status(204).send();
  } catch (error) {
    handleSpotifyError("POST /display/play", error, res);
  }
});

displayRouter.post("/pause", async (_req: Request, res: Response) => {
  try {
    await pausePlayback(clientId, clientSecret);
    res.status(204).send();
  } catch (error) {
    handleSpotifyError("POST /display/pause", error, res);
  }
});

displayRouter.post("/next", async (_req: Request, res: Response) => {
  try {
    await skipToNext(clientId, clientSecret);
    res.status(204).send();
  } catch (error) {
    handleSpotifyError("POST /display/next", error, res);
  }
});

displayRouter.post("/previous", async (_req: Request, res: Response) => {
  try {
    await skipToPrevious(clientId, clientSecret);
    res.status(204).send();
  } catch (error) {
    handleSpotifyError("POST /display/previous", error, res);
  }
});

// PUT /display/device — transfer playback to a specific device
// Body: { deviceId: string, play?: boolean }
displayRouter.put("/device", async (req: Request, res: Response) => {
  const { deviceId, play = false } = req.body as {
    deviceId?: unknown;
    play?: unknown;
  };

  if (typeof deviceId !== "string" || deviceId.trim() === "") {
    res.status(400).json({ error: "deviceId is required" });
    return;
  }

  try {
    await transferPlayback(deviceId, Boolean(play), clientId, clientSecret);
    res.status(204).send();
  } catch (error) {
    handleSpotifyError("PUT /display/device", error, res);
  }
});

// PUT /display/seek — seek to position in the currently playing track
// Body: { positionMs: number }
displayRouter.put("/seek", async (req: Request, res: Response) => {
  const { positionMs } = req.body as { positionMs?: unknown };

  if (
    typeof positionMs !== "number" ||
    positionMs < 0 ||
    !Number.isFinite(positionMs)
  ) {
    res.status(400).json({ error: "positionMs must be a non-negative number" });
    return;
  }

  try {
    await seekToPosition(Math.floor(positionMs), clientId, clientSecret);
    res.status(204).send();
  } catch (error) {
    handleSpotifyError("PUT /display/seek", error, res);
  }
});

export { displayRouter };
