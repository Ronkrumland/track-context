import { Router } from "express";
import { getNowPlaying } from "./display.service.js";
import type { NowPlayingResponseDto } from "./display.types.js";

const displayRouter = Router();

displayRouter.get("/now-playing", (_req, res) => {
  const response: NowPlayingResponseDto = getNowPlaying();
  res.json(response);
});

displayRouter.post("/play", (_req, res) => {
  res.status(204).send();
});

displayRouter.post("/pause", (_req, res) => {
  res.status(204).send();
});

displayRouter.post("/next", (_req, res) => {
  res.status(204).send();
});

displayRouter.post("/previous", (_req, res) => {
  res.status(204).send();
});

export { displayRouter };
