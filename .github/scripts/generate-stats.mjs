import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

if (!process.env.PAT_1) {
  throw new Error("Missing PROFILE_STATS_TOKEN. Configure this Actions secret with a personal access token that can read public repositories; the workflow passes it as PAT_1.");
}

// The workflow checks out the original, pinned anuraghazra component here.
const source = resolve(process.env.STATS_SOURCE || ".cache/github-readme-stats");

// The pinned upstream predates GitHub's restrictions on the stargazers list.
// Read the public count directly, including both pagination and aggregation.
// Apply this to the temporary checkout on every workflow run, before importing it.
const statsFile = resolve(source, "src/fetchers/stats.js");
const statsSource = await readFile(statsFile, "utf8");
const legacyQuery = /stargazers\s*\{\s*totalCount\s*\}/g;
const legacyRead = /\.stargazers\.totalCount/g;
const queryCount = [...statsSource.matchAll(legacyQuery)].length;
const readCount = [...statsSource.matchAll(legacyRead)].length;
if (queryCount === 1 && readCount === 2) {
  await writeFile(
    statsFile,
    statsSource.replace(legacyQuery, "stargazerCount").replace(legacyRead, ".stargazerCount"),
    "utf8",
  );
  console.log("Updated legacy stars query to stargazerCount.");
} else if (queryCount !== 0 || readCount !== 0 || !statsSource.includes("stargazerCount")) {
  throw new Error("Unexpected upstream stats source; cannot safely apply the stars-query compatibility fix.");
}

const load = (file) => import(pathToFileURL(resolve(source, file)).href);
const [{ fetchStats }, { fetchTopLanguages }, { renderStatsCard }, { renderTopLanguages }] =
  await Promise.all([
    load("src/fetchers/stats.js"),
    load("src/fetchers/top-languages.js"),
    load("src/cards/stats.js"),
    load("src/cards/top-languages.js"),
  ]);

const username = "KevinGuo1007";

// Fetch once per card type; reuse the data for both themes.
// Fetchers throw on API errors, so failures never replace good cards with error SVGs.
const [stats, languages] = await Promise.all([
  fetchStats(username),
  fetchTopLanguages(username),
]);
if (!Object.keys(languages).length) {
  throw new Error("No public repository language data was returned.");
}

const output = resolve(process.env.PROFILE_OUTPUT || "profile");
const cards = [];
for (const [theme, colors] of Object.entries({
  light: { title_color: "0969da", text_color: "1f2328", icon_color: "0969da" },
  dark: { title_color: "58a6ff", text_color: "c9d1d9", icon_color: "58a6ff" },
})) {
  const shared = {
    ...colors,
    bg_color: "00000000",
    hide_border: true,
    disable_animations: true,
    locale: "en",
  };
  cards.push([
    `stats-${theme}.svg`,
    renderStatsCard(stats, {
      ...shared,
      custom_title: "GitHub Stats",
      show_icons: true,
      hide_rank: true,
      card_width: 390,
      line_height: 20,
    }),
  ]);
  cards.push([
    `languages-${theme}.svg`,
    renderTopLanguages(languages, {
      ...shared,
      custom_title: "Most Used Languages",
      layout: "compact",
      langs_count: 6,
      card_width: 330,
    }),
  ]);
}

await mkdir(output, { recursive: true });
for (const [name, svg] of cards) {
  await writeFile(resolve(output, name), svg, "utf8");
  console.log(`Generated ${name}`);
}
