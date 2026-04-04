import type { NowPlayingResponseDto } from "./display.types.js";

export function getNowPlaying(): NowPlayingResponseDto {
  return {
    trackTitle: "Disorder",
    artistName: "Terminal Serious",
    albumName: "Love Was Lies",
    albumArtUrl:
      "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png",
    isPlaying: true,
    progressSeconds: 120,
    durationSeconds: 354,
    source: "spotify",
    isControllable: true,
    lastUpdatedAt: new Date().toISOString(),
    trackUrl: null,
  };
}
