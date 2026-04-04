export type NowPlayingResponseDto = {
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
};
