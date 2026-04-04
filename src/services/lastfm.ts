export type TrackItem = {
  track: string;
  artist: string;
  album: string;
  isNowPlaying: boolean;
  playedAt: string | null;
};

// TODO: Make this configurable via environment variable or function parameter.
const RECENT_TRACKS_LIMIT = 10;
const LAST_FM_URL = "https://ws.audioscrobbler.com/2.0/";

export class LastfmApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
    public responseBody: string,
  ) {
    super(message);
    this.name = "LastfmApiError";
  }
}

type LastfmRecentTracksResponse = {
  recenttracks?: {
    track?: Array<{
      name?: string;
      artist?: { "#text"?: string };
      album?: { "#text"?: string };
      date?: { uts?: string };
      "@attr"?: { nowplaying?: string };
    }>;
  };
};

async function fetchRecentTracks(
  apiKey: string,
  username: string,
  limit: number,
): Promise<TrackItem[]> {
  const url = new URL(LAST_FM_URL);
  url.search = new URLSearchParams({
    method: "user.getrecenttracks",
    user: username,
    api_key: apiKey,
    format: "json",
    limit: String(limit),
  }).toString();

  const response = await fetch(url);
  if (!response.ok) {
    // Cap the captured error body so thrown errors do not balloon with large responses.
    const responseBody = (await response.text()).slice(0, 1000);
    throw new LastfmApiError(
      "Last.fm request failed",
      response.status,
      response.statusText,
      responseBody,
    );
  }

  const data = (await response.json()) as LastfmRecentTracksResponse;
  const tracks = data.recenttracks?.track ?? [];

  return tracks.map((item) => {
    let playedAt: string | null = null;

    if (item.date?.uts != null) {
      const unixTimestampSeconds = Number(item.date.uts);

      if (Number.isFinite(unixTimestampSeconds)) {
        playedAt = new Date(unixTimestampSeconds * 1000).toISOString();
      }
    }

    return {
      track: item.name ?? "",
      artist: item.artist?.["#text"] ?? "",
      album: item.album?.["#text"] ?? "",
      isNowPlaying: item["@attr"]?.nowplaying === "true",
      playedAt,
    };
  });
}

export async function getRecentTracks(
  apiKey: string,
  username: string,
): Promise<TrackItem[]> {
  // Fetch one extra because Last.fm includes the current "now playing" track
  // in the recent tracks response, and we still want up to the configured limit.
  return fetchRecentTracks(apiKey, username, RECENT_TRACKS_LIMIT + 1);
}

export async function getNowPlayingOrRecentTrack(
  apiKey: string,
  username: string,
): Promise<TrackItem | null> {
  const tracks = await fetchRecentTracks(apiKey, username, 5);
  if (tracks.length === 0) {
    return null;
  }

  return tracks.find((track) => track.isNowPlaying) ?? tracks[0];
}
