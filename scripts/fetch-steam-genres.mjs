#!/usr/bin/env node
/**
 * Steam 공식 장르를 games.json 에 steam_genres 로 기록하는 헬퍼 (선택 도구)
 *
 * 사용법:
 *   STEAM_KEY=xxxx STEAM_ID=7656119xxxxxxxxxx node scripts/fetch-steam-genres.mjs
 *
 * 하는 일:
 *   1) 소유목록에서 제목→appid 매핑 (Web API, 키 필요)
 *   2) 상점 API(appdetails, 키 불필요)로 게임별 공식 장르(한국어) 조회
 *   3) steam_genres 필드를 games.json 에 기록 (검증 레이어; 화면 표시는 큐레이션 genre 사용)
 *
 * 주의: 상점 API는 rate limit이 빡빡해 호출 사이 텀을 크게 둡니다(약 1.6s). 105개 ≈ 3분.
 */

const KEY = process.env.STEAM_KEY;
const ID = process.env.STEAM_ID;
const GJ = new URL("../games.json", import.meta.url);

if (!KEY || !ID) {
  console.error("STEAM_KEY 와 STEAM_ID 환경변수가 필요합니다.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fs = await import("node:fs");
const data = JSON.parse(fs.readFileSync(GJ));

// 1) 제목 → appid
const ownedRes = await fetch(
  `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${KEY}&steamid=${ID}&include_appinfo=1&include_played_free_games=1&format=json`
);
const owned = await ownedRes.json();
const appidOf = {};
for (const g of owned?.response?.games || []) appidOf[g.name] = g.appid;

// 2) 상점 API로 공식 장르 (재시도 포함)
async function genresFor(appid, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=koreana`);
      if (res.status === 429) { await sleep(6000); continue; }
      const j = await res.json();
      const d = j?.[appid];
      if (d?.success && d.data) return (d.data.genres || []).map((x) => x.description);
      return [];
    } catch { await sleep(3000); }
  }
  return null; // 실패
}

const steam = data.games.filter((g) => g.platform === "Steam");
let ok = 0, empty = 0, fail = 0, unmatched = 0;
for (const g of steam) {
  const appid = appidOf[g.title];
  if (!appid) { unmatched++; console.error(`  매칭 실패: ${g.title}`); continue; }
  await sleep(1600);
  const gs = await genresFor(appid);
  if (gs === null) { fail++; console.error(`  조회 실패: ${g.title}`); continue; }
  g.steam_genres = gs;
  if (gs.length) ok++; else empty++;
}

fs.writeFileSync(GJ, JSON.stringify(data, null, 2) + "\n");
console.error(`\n완료 — 공식장르 기록 ${ok}개 · 빈값 ${empty}개 · 실패 ${fail}개 · 매칭실패 ${unmatched}개`);
