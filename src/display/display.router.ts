import { Router } from "express";
import type { Request, Response } from "express";
import {
  getNowPlaying,
  getAvailableDevices,
  getPlaybackQueue,
} from "./display.service.js";
import { SpotifyApiError } from "../services/spotify.js";
import type { SpotifyAuthManager } from "../services/spotify.js";

function handleSpotifyError(
  context: string,
  error: unknown,
  res: Response,
): void {
  if (error instanceof SpotifyApiError) {
    if (error.status === 401) {
      res.status(401).json({
        code: "spotify_auth_required",
        error: error.message,
      });
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

export function createDisplayRouter(auth: SpotifyAuthManager): Router {
  const router = Router();

  router.get("/now-playing", async (_req: Request, res: Response) => {
    try {
      const response = await getNowPlaying(auth);
      if (!response) {
        res.status(204).send();
        return;
      }
      res.json(response);
    } catch (error) {
      handleSpotifyError("GET /display/now-playing", error, res);
    }
  });

  router.get("/devices", async (_req: Request, res: Response) => {
    try {
      const response = await getAvailableDevices(auth);
      res.json(response);
    } catch (error) {
      handleSpotifyError("GET /display/devices", error, res);
    }
  });

  router.get("/queue", async (_req: Request, res: Response) => {
    try {
      const response = await getPlaybackQueue(auth);
      res.json(response);
    } catch (error) {
      handleSpotifyError("GET /display/queue", error, res);
    }
  });

  router.post("/play", async (_req: Request, res: Response) => {
    try {
      await auth.resumePlayback();
      res.status(204).send();
    } catch (error) {
      handleSpotifyError("POST /display/play", error, res);
    }
  });

  router.post("/pause", async (_req: Request, res: Response) => {
    try {
      await auth.pausePlayback();
      res.status(204).send();
    } catch (error) {
      handleSpotifyError("POST /display/pause", error, res);
    }
  });

  router.post("/next", async (_req: Request, res: Response) => {
    try {
      await auth.skipToNext();
      res.status(204).send();
    } catch (error) {
      handleSpotifyError("POST /display/next", error, res);
    }
  });

  router.post("/previous", async (_req: Request, res: Response) => {
    try {
      await auth.skipToPrevious();
      res.status(204).send();
    } catch (error) {
      handleSpotifyError("POST /display/previous", error, res);
    }
  });

  router.put("/device", async (req: Request, res: Response) => {
    const { deviceId, play = false } = req.body as {
      deviceId?: unknown;
      play?: unknown;
    };

    if (typeof deviceId !== "string" || deviceId.trim() === "") {
      res.status(400).json({ error: "deviceId is required" });
      return;
    }

    try {
      await auth.transferPlayback(deviceId, Boolean(play));
      res.status(204).send();
    } catch (error) {
      handleSpotifyError("PUT /display/device", error, res);
    }
  });

  router.put("/seek", async (req: Request, res: Response) => {
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
      await auth.seekToPosition(Math.floor(positionMs));
      res.status(204).send();
    } catch (error) {
      handleSpotifyError("PUT /display/seek", error, res);
    }
  });

  return router;
}
