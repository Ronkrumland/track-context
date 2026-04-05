import type { NowPlayingResponse, QueuedTrack } from "./display.types.js";

type MockTrack = QueuedTrack & {
  progressSeconds: number;
};

const mockQueue: MockTrack[] = [
  {
    trackTitle: "Signal Bloom",
    artistName: "Neon Avenue",
    albumName: "Midnight Transit",
    albumArtUrl: "https://picsum.photos/seed/signal-bloom/300/300",
    durationSeconds: 198,
    progressSeconds: 64,
    trackUrl: null,
  },
  {
    trackTitle: "Paper Satellites",
    artistName: "Cinder Arcade",
    albumName: "Static Summer",
    albumArtUrl: "https://picsum.photos/seed/paper-satellites/300/300",
    durationSeconds: 245,
    progressSeconds: 121,
    trackUrl: null,
  },
  {
    trackTitle: "Backlit Hearts",
    artistName: "Mira Vale",
    albumName: "Polaroid Weather",
    albumArtUrl: "https://picsum.photos/seed/backlit-hearts/300/300",
    durationSeconds: 221,
    progressSeconds: 48,
    trackUrl: null,
  },
  {
    trackTitle: "Southbound Echo",
    artistName: "The Lantern Lines",
    albumName: "Sleepless Highways",
    albumArtUrl: "https://picsum.photos/seed/southbound-echo/300/300",
    durationSeconds: 312,
    progressSeconds: 208,
    trackUrl: null,
  },
  {
    trackTitle: "Velvet Receiver",
    artistName: "Hotel Meridian",
    albumName: "After the Lobby Closes",
    albumArtUrl: "https://picsum.photos/seed/velvet-receiver/300/300",
    durationSeconds: 176,
    progressSeconds: 39,
    trackUrl: null,
  },
  {
    trackTitle: "Parallel Lights",
    artistName: "June Circuit",
    albumName: "Electric Maps",
    albumArtUrl: "https://picsum.photos/seed/parallel-lights/300/300",
    durationSeconds: 267,
    progressSeconds: 144,
    trackUrl: null,
  },
  {
    trackTitle: "Slow Comet",
    artistName: "Harbor Static",
    albumName: "Night Class",
    albumArtUrl: "https://picsum.photos/seed/slow-comet/300/300",
    durationSeconds: 289,
    progressSeconds: 17,
    trackUrl: null,
  },
  {
    trackTitle: "Cherry Voltage",
    artistName: "The Soft Exit",
    albumName: "Runaway Gloss",
    albumArtUrl: "https://picsum.photos/seed/cherry-voltage/300/300",
    durationSeconds: 203,
    progressSeconds: 133,
    trackUrl: null,
  },
  {
    trackTitle: "Night Shift Arcade",
    artistName: "Blue Parade",
    albumName: "Coin-Op Dreams",
    albumArtUrl: "https://picsum.photos/seed/night-shift-arcade/300/300",
    durationSeconds: 334,
    progressSeconds: 251,
    trackUrl: null,
  },
  {
    trackTitle: "Glass Rooftops",
    artistName: "Rivers & Relay",
    albumName: "City Weather Reports",
    albumArtUrl: "https://picsum.photos/seed/glass-rooftops/300/300",
    durationSeconds: 194,
    progressSeconds: 91,
    trackUrl: null,
  },
  {
    trackTitle: "Coastal Memory",
    artistName: "Low Tide Union",
    albumName: "Postcards in Reverse",
    albumArtUrl: "https://picsum.photos/seed/coastal-memory/300/300",
    durationSeconds: 258,
    progressSeconds: 212,
    trackUrl: null,
  },
  {
    trackTitle: "Morning After Neon",
    artistName: "Northbound Youth",
    albumName: "Last Train Home",
    albumArtUrl: "https://picsum.photos/seed/morning-after-neon/300/300",
    durationSeconds: 228,
    progressSeconds: 57,
    trackUrl: null,
  },
];

let currentTrackIndex = 0;

function getTrackAt(index: number): MockTrack {
  return mockQueue[index % mockQueue.length];
}

function getPlayingNext(index: number): QueuedTrack {
  const nextTrack = getTrackAt(index + 1);

  return {
    trackTitle: nextTrack.trackTitle,
    artistName: nextTrack.artistName,
    albumName: nextTrack.albumName,
    albumArtUrl: nextTrack.albumArtUrl,
    durationSeconds: nextTrack.durationSeconds,
    trackUrl: nextTrack.trackUrl,
  };
}

export function getNowPlaying(): NowPlayingResponse {
  const currentTrack = getTrackAt(currentTrackIndex);
  const response: NowPlayingResponse = {
    trackTitle: currentTrack.trackTitle,
    artistName: currentTrack.artistName,
    albumName: currentTrack.albumName,
    albumArtUrl: currentTrack.albumArtUrl,
    isPlaying: true,
    progressSeconds: currentTrack.progressSeconds,
    durationSeconds: currentTrack.durationSeconds,
    source: "spotify",
    isControllable: true,
    lastUpdatedAt: new Date().toISOString(),
    trackUrl: currentTrack.trackUrl,
    playingNext: getPlayingNext(currentTrackIndex),
  };

  currentTrackIndex = (currentTrackIndex + 1) % mockQueue.length;

  return response;
}
