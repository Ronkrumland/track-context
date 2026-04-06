import type {
  NowPlayingResponse,
  QueuedTrack,
  DevicesResponse,
  DeviceInfo,
  QueueResponse,
} from "./display.types.js";
import {
  getCurrentlyPlaying,
  getDevices as spotifyGetDevices,
  getQueue as spotifyGetQueue,
  type SpotifyTrack,
} from "../services/spotify.js";

function mapSpotifyTrackToQueuedTrack(track: SpotifyTrack): QueuedTrack {
  return {
    trackTitle: track.name,
    artistName: track.artists.map((a) => a.name).join(", "),
    albumName: track.album.name,
    albumArtUrl: track.album.images[0]?.url ?? "",
    durationSeconds: Math.floor(track.duration_ms / 1000),
    trackUrl: track.external_urls.spotify,
  };
}

export async function getNowPlaying(
  clientId: string,
  clientSecret: string,
): Promise<NowPlayingResponse | null> {
  const [playbackData, queueData] = await Promise.all([
    getCurrentlyPlaying(clientId, clientSecret),
    spotifyGetQueue(clientId, clientSecret).catch(() => null),
  ]);

  if (!playbackData || !playbackData.item) {
    return null;
  }

  const nextTrack =
    queueData?.queue[0]
      ? mapSpotifyTrackToQueuedTrack(queueData.queue[0])
      : null;

  return {
    trackTitle: playbackData.item.name,
    artistName: playbackData.item.artists.map((a) => a.name).join(", "),
    albumName: playbackData.item.album.name,
    albumArtUrl: playbackData.item.album.images[0]?.url ?? "",
    isPlaying: playbackData.is_playing,
    progressSeconds: Math.floor((playbackData.progress_ms ?? 0) / 1000),
    durationSeconds: Math.floor(playbackData.item.duration_ms / 1000),
    source: "spotify",
    isControllable: true,
    trackUrl: playbackData.item.external_urls.spotify,
    lastUpdatedAt: new Date().toISOString(),
    playingNext: nextTrack,
  };
}

export async function getAvailableDevices(
  clientId: string,
  clientSecret: string,
): Promise<DevicesResponse> {
  const data = await spotifyGetDevices(clientId, clientSecret);

  const devices: DeviceInfo[] = data.devices
    .filter((d) => d.id !== null)
    .map((d) => ({
      id: d.id!,
      name: d.name,
      type: d.type,
      isActive: d.is_active,
      volumePercent: d.volume_percent,
    }));

  return { devices };
}

export async function getPlaybackQueue(
  clientId: string,
  clientSecret: string,
): Promise<QueueResponse> {
  const data = await spotifyGetQueue(clientId, clientSecret);

  return {
    currentlyPlaying: data.currently_playing
      ? mapSpotifyTrackToQueuedTrack(data.currently_playing)
      : null,
    queue: data.queue.map(mapSpotifyTrackToQueuedTrack),
  };
}
