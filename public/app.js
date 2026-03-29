const tokenInput = document.getElementById("token");
const loadButton = document.getElementById("load");
const copyCurrentButton = document.getElementById("copyCurrent");
const copyButton = document.getElementById("copy");
const copyStatusEl = document.getElementById("copyStatus");
const statusEl = document.getElementById("status");
const currentTrackEl = document.getElementById("currentTrack");
const recentTracksEl = document.getElementById("recentTracks");

const RECENT_PREVIOUS_TRACKS_LIMIT = 10;

const savedToken = localStorage.getItem("trackcontext.token");
if (savedToken) {
  tokenInput.value = savedToken;
}

let currentTrack = null;
let previousTracks = [];

function setStatus(message) {
  statusEl.textContent = message;
}

function setCopyStatus(message) {
  copyStatusEl.textContent = message;
}

function makeAuthHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function fetchJson(path, token) {
  const response = await fetch(path, {
    headers: makeAuthHeaders(token),
  });

  if (!response.ok) {
    let details = "";
    try {
      const body = await response.json();
      details = body.error ? `: ${body.error}` : "";
    } catch {
      details = "";
    }

    throw new Error(`Request failed (${response.status})${details}`);
  }

  return response.json();
}

function trackLine(track) {
  return `${track.track} - ${track.artist} (${track.album || "Unknown album"})`;
}

function render() {
  if (currentTrack) {
    const nowPlaying = currentTrack.isNowPlaying ? "Yes" : "No";
    currentTrackEl.innerHTML = `
      <strong>${currentTrack.track}</strong><br>
      Artist: ${currentTrack.artist}<br>
      Album: ${currentTrack.album || "Unknown album"}<br>
      Now Playing: ${nowPlaying}
    `;
  } else {
    currentTrackEl.textContent = "No current track found.";
  }

  recentTracksEl.innerHTML = "";
  if (previousTracks.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No previous tracks found.";
    recentTracksEl.appendChild(li);
  } else {
    for (const track of previousTracks) {
      const li = document.createElement("li");
      li.textContent = trackLine(track);
      recentTracksEl.appendChild(li);
    }
  }

  copyCurrentButton.disabled = !currentTrack;
  copyButton.disabled = !currentTrack;
  if (!currentTrack) {
    setCopyStatus("");
  }
}

function currentTrackPromptLine(track) {
  return `"${track.track}" by ${track.artist} from "${track.album || "Unknown album"}"`;
}

function buildCurrentTrackCopyText() {
  const lines = [];
  lines.push("Use this music context in the conversation if it is relevant.");
  lines.push("");
  lines.push("Current track:");
  lines.push(`- Title: ${currentTrack.track}`);
  lines.push(`- Artist: ${currentTrack.artist}`);
  lines.push(`- Album: ${currentTrack.album || "Unknown album"}`);
  lines.push(`- Playback status: ${currentTrack.isNowPlaying ? "Now playing" : "Recently played"}`);
  lines.push("");
  lines.push(`Short form: ${currentTrackPromptLine(currentTrack)}`);
  return lines.join("\n");
}

function buildCopyText() {
  const lines = [];
  lines.push("Use this music context in the conversation if it is relevant.");
  lines.push("");
  lines.push("Current track:");
  lines.push(`- Track: ${currentTrack.track}`);
  lines.push(`- Artist: ${currentTrack.artist}`);
  lines.push(`- Album: ${currentTrack.album || "Unknown album"}`);
  lines.push(`- Playback status: ${currentTrack.isNowPlaying ? "Now playing" : "Recently played"}`);
  lines.push("");
  lines.push("Recent listening history:");

  if (previousTracks.length === 0) {
    lines.push("- None");
  } else {
    previousTracks.forEach((track, index) => {
      lines.push(`${index + 1}. ${trackLine(track)}`);
    });
  }

  return lines.join("\n");
}

async function loadTracks() {
  const token = tokenInput.value.trim();
  if (!token) {
    setStatus("Please enter a bearer token.");
    return;
  }

  loadButton.disabled = true;
  copyCurrentButton.disabled = true;
  copyButton.disabled = true;
  setCopyStatus("");
  setStatus("Loading...");

  try {
    localStorage.setItem("trackcontext.token", token);

    const [nowPlayingResult, recentTracksResult] = await Promise.all([
      fetchJson("/now-playing", token),
      fetchJson("/recent-tracks", token),
    ]);

    currentTrack = nowPlayingResult.track;
    const allRecentTracks = recentTracksResult.tracks || [];

    previousTracks = allRecentTracks
      .filter((track) => {
        return !(track.track === currentTrack.track
          && track.artist === currentTrack.artist
          && track.album === currentTrack.album);
      })
      .slice(0, RECENT_PREVIOUS_TRACKS_LIMIT);

    render();
    setStatus("Loaded.");
  } catch (error) {
    currentTrack = null;
    previousTracks = [];
    render();
    setStatus(error instanceof Error ? error.message : "Failed to load tracks.");
  } finally {
    loadButton.disabled = false;
  }
}

loadButton.addEventListener("click", () => {
  void loadTracks();
});

copyButton.addEventListener("click", async () => {
  if (!currentTrack) {
    return;
  }

  const text = buildCopyText();
  try {
    await navigator.clipboard.writeText(text);
    setCopyStatus("Copied full listening context.");
  } catch {
    setCopyStatus("Copy failed. Your browser may block clipboard access.");
  }
});

copyCurrentButton.addEventListener("click", async () => {
  if (!currentTrack) {
    return;
  }

  const text = buildCurrentTrackCopyText();
  try {
    await navigator.clipboard.writeText(text);
    setCopyStatus("Copied current track context.");
  } catch {
    setCopyStatus("Copy failed. Your browser may block clipboard access.");
  }
});
