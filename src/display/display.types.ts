export type QueuedTrack = {
  trackTitle: string;
  artistName: string;
  albumName: string;
  albumArtUrl: string;
  durationSeconds: number;
  trackUrl: string | null;
};

export type NowPlayingResponse = {
  trackTitle: string;
  artistName: string;
  albumName: string;
  albumArtUrl: string;
  isPlaying: boolean;
  progressSeconds: number;
  durationSeconds: number;
  source: string;
  isControllable: boolean;
  trackUrl: string | null;
  lastUpdatedAt: string;
  playingNext: QueuedTrack | null;
};
