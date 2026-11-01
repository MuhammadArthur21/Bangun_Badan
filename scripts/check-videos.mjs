import { readFile } from "node:fs/promises";

const videoIds = JSON.parse(
  await readFile(new URL("../data/video-ids.json", import.meta.url), "utf8"),
);
const entries = Object.entries(videoIds);
if (entries.length === 0) {
  console.log("Belum ada ID video untuk diperiksa.");
  process.exit(0);
}

const failures = [];
for (const [exerciseId, videoId] of entries) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    failures.push(`${exerciseId}: format ID bukan 11 karakter.`);
    continue;
  }

  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
  endpoint.searchParams.set("format", "json");
  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      failures.push(`${exerciseId}: YouTube merespons HTTP ${response.status}.`);
    } else {
      console.log(`${exerciseId}: ID video valid (oEmbed).`);
    }
  } catch (error) {
    failures.push(
      `${exerciseId}: pemeriksaan jaringan gagal: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
