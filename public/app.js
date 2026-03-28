const tokenInput = document.getElementById("token");
const loadButton = document.getElementById("load");
const copyButton = document.getElementById("copy");
const statusEl = document.getElementById("status");
const currentTrackEl = document.getElementById("currentTrack");
const recentTracksEl = document.getElementById("recentTracks");

const savedToken = localStorage.getItem("trackcontext.token");
if (savedToken) {
  tokenInput.value = savedToken;
}

let currentTrack = null;
let previousTracks = [];

function setStatus(message) {
  statusEl.textContent = message;
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

  copyButton.disabled = !currentTrack;
}

function buildCopyText() {
  const lines = [];
  lines.push("Current Track:");
  lines.push(`- Track: ${currentTrack.track}`);
  lines.push(`- Artist: ${currentTrack.artist}`);
  lines.push(`- Album: ${currentTrack.album || "Unknown album"}`);
  lines.push("");
  lines.push("Recent Listening History:");

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
  copyButton.disabled = true;
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
      .slice(0, 5);

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
    setStatus("Copied for ChatGPT.");
  } catch {
    setStatus("Copy failed. Your browser may block clipboard access.");
  }
});
