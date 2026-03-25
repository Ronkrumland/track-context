import express from "express";
import dotenv from "dotenv";
import {
  getNowPlayingOrRecentTrack,
  getRecentTracks,
  LastfmApiError,
} from "./services/lastfm.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;
const lastfmApiKey = process.env.LASTFM_API_KEY;
const lastfmUsername = process.env.LASTFM_USERNAME;

if (!lastfmApiKey || !lastfmUsername) {
  console.error("Invalid configuration: LASTFM_API_KEY and LASTFM_USERNAME are required.");
  process.exit(1);
}

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
    if (error instanceof LastfmApiError) {
      res.status(500).json({
        error: "Failed to fetch tracks",
        details: {
          upstream: "last.fm",
          status: error.status,
          statusText: error.statusText,
          response: error.responseBody,
        },
      });
      return;
    }

    res.status(500).json({ error: "Failed to fetch tracks" });
  }
});

app.get("/now-playing", async (_req, res) => {
  try {
    const track = await getNowPlayingOrRecentTrack(lastfmApiKey, lastfmUsername);
    if (!track) {
      res.status(404).json({ error: "No tracks found" });
      return;
    }

    res.json({ track });
  } catch (error) {
    if (error instanceof LastfmApiError) {
      res.status(500).json({
        error: "Failed to fetch track",
        details: {
          upstream: "last.fm",
          status: error.status,
          statusText: error.statusText,
          response: error.responseBody,
        },
      });
      return;
    }

    res.status(500).json({ error: "Failed to fetch track" });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`LASTFM_API_KEY configured: ${Boolean(lastfmApiKey)}`);
  console.log(`LASTFM_USERNAME configured: ${Boolean(lastfmUsername)}`);
});
