import { readFile } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diatur untuk seed.",
  );
}

const [curatedText, videoIdsText] = await Promise.all([
  readFile(new URL("../data/exercises-curated.json", import.meta.url), "utf8"),
  readFile(new URL("../data/video-ids.json", import.meta.url), "utf8"),
]);
const curatedExercises = JSON.parse(curatedText);
const videoIds = JSON.parse(videoIdsText);

if (
  !Array.isArray(curatedExercises) ||
  typeof videoIds !== "object" ||
  videoIds === null ||
  Array.isArray(videoIds)
) {
  throw new TypeError("Data katalog atau ID video memiliki format yang tidak valid.");
}

for (const [exerciseId, videoId] of Object.entries(videoIds)) {
  if (typeof videoId !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new TypeError(`ID video untuk ${exerciseId} harus terdiri dari 11 karakter.`);
  }
}

const rows = curatedExercises.map((exercise) => ({
  ...exercise,
  video_id: videoIds[exercise.id] ?? exercise.video_id,
}));
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const batchSize = 100;

for (let index = 0; index < rows.length; index += batchSize) {
  const { error } = await supabase
    .from("exercises")
    .upsert(rows.slice(index, index + batchSize), { onConflict: "id" });
  if (error) {
    throw new Error(`Seed gagal pada kelompok ${index / batchSize + 1}: ${error.message}`);
  }
}

console.log(`Berhasil melakukan upsert ${rows.length} latihan curated.`);
