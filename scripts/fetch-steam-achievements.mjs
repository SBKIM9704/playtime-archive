#!/usr/bin/env node
/**
 * Steam 게임별 과제(실적) 달성률을 games.json 에 채우는 헬퍼 (선택 도구)
 *
 * 사용법:
 *   STEAM_KEY=xxxx STEAM_ID=7656119xxxxxxxxxx node scripts/fetch-steam-achievements.mjs
 *
 * 하는 일:
 *   1) 소유목록에서 제목→appid 매핑
 *   2) games.json 의 Steam 게임마다 GetPlayerAchievements 호출 → 달성률(%) 계산
 *   3) achievement_pct / achievement_done / achievement_total 필드를 games.json 에 기록
 *      (실적이 없는 게임은 achievement_pct = null)
 */

const KEY = process.env.STEAM_KEY;
const ID = process.env.STEAM_ID;
const GJ = new URL("../games.json", import.meta.url);

if (!KEY || !ID) {
  console.error("STEAM_KEY 와 STEAM_ID 환경변수가 필요합니다.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url);
    if (res.status === 429) { await sleep(2000); continue; }
    if (res.status === 403) return { __forbidden: true };
    try { return await res.json(); } catch { return null; }
  }
  return null;
}

const fs = await import("node:fs");
const data = JSON.parse(fs.readFileSync(GJ));

// 1) 제목 → appid
const owned = await getJSON(
  `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${KEY}&steamid=${ID}&include_appinfo=1&include_played_free_games=1&format=json`
);
const appidOf = {};
for (const g of owned?.response?.games || []) appidOf[g.name] = g.appid;

// 2) Steam 게임마다 실적 조회
const steam = data.games.filter((g) => g.platform === "Steam");
let withPct = 0, noAch = 0, unmatched = 0;
for (const g of steam) {
  const appid = appidOf[g.title];
  if (!appid) { unmatched++; console.error(`  매칭 실패: ${g.title}`); continue; }
  await sleep(140);
  const j = await getJSON(
    `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${KEY}&steamid=${ID}&appid=${appid}`
  );
  const ach = j?.playerstats?.achievements;
  if (Array.isArray(ach) && ach.length) {
    const done = ach.filter((a) => a.achieved === 1).length;
    g.achievement_done = done;
    g.achievement_total = ach.length;
    g.achievement_pct = Math.round((done / ach.length) * 100);
    withPct++;
  } else {
    g.achievement_pct = null; // 실적 없는 게임
    noAch++;
  }
}

fs.writeFileSync(GJ, JSON.stringify(data, null, 2) + "\n");
console.error(`\n완료 — 실적률 기록 ${withPct}개 · 실적없음 ${noAch}개 · 매칭실패 ${unmatched}개`);
