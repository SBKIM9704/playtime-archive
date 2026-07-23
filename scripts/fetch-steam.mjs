#!/usr/bin/env node
/**
 * Steam GetOwnedGames -> games.json 항목 변환 헬퍼 (선택 도구)
 *
 * 사용법:
 *   1) 스팀 프로필을 공개로 전환 (프로필 편집 → 개인정보 → "게임 세부 정보"를 공개)
 *   2) https://steamcommunity.com/dev/apikey 에서 API 키 발급
 *   3) 아래처럼 실행 (키/ID는 환경변수로 주입 — 리포에 커밋 금지):
 *
 *      STEAM_KEY=xxxx STEAM_ID=<17자리ID 또는 프로필이름> node scripts/fetch-steam.mjs > steam-games.json
 *
 *      · STEAM_ID 에는 17자리 SteamID64 를 넣어도 되고,
 *        프로필 URL 이 steamcommunity.com/id/mycoolname 이면 그냥 mycoolname 을 넣어도 됨
 *        (자동으로 SteamID64 로 변환).
 *
 *   4) 출력된 항목을 games.json 의 "games" 배열에 붙여넣고,
 *      장르 태깅 / cleared 여부 / 한 줄 평을 직접 채운다 (2단계).
 *
 * 주의: playtime_forever 는 '분' 단위 → 시간으로 반올림.
 *       플레이타임 0.5시간(30분) 미만 잡템은 기본적으로 제외 (MIN_HOURS 조정 가능).
 */

const KEY = process.env.STEAM_KEY;
const ID_INPUT = process.env.STEAM_ID;
const MIN_HOURS = Number(process.env.MIN_HOURS ?? 0.5);

if (!KEY || !ID_INPUT) {
  console.error("STEAM_KEY 와 STEAM_ID 환경변수가 필요합니다.");
  console.error("예: STEAM_KEY=xxxx STEAM_ID=mycoolname node scripts/fetch-steam.mjs > steam-games.json");
  process.exit(1);
}

// 17자리 숫자면 SteamID64 그대로, 아니면 vanity 이름으로 보고 변환
async function resolveSteamId(input) {
  if (/^\d{17}$/.test(input)) return input;
  const vanity = input.replace(/^.*\/id\//, "").replace(/\/$/, ""); // URL 통째로 넣어도 처리
  const u = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${KEY}&vanityurl=${encodeURIComponent(vanity)}`;
  const r = await fetch(u);
  const j = await r.json();
  if (j?.response?.success === 1) {
    console.error(`vanity "${vanity}" → SteamID64 ${j.response.steamid}`);
    return j.response.steamid;
  }
  console.error(`프로필 이름 "${vanity}" 을(를) 변환하지 못했습니다. 17자리 SteamID64 를 직접 넣어보세요 (steamid.io 등에서 확인).`);
  process.exit(1);
}

const ID = await resolveSteamId(ID_INPUT);

const url =
  `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` +
  `?key=${KEY}&steamid=${ID}&include_appinfo=1&include_played_free_games=1&format=json`;

const res = await fetch(url);
if (!res.ok) {
  console.error(`Steam API 오류: ${res.status} ${res.statusText}`);
  process.exit(1);
}

const json = await res.json();
const raw = json?.response?.games ?? [];

const games = raw
  .map((g) => ({
    title: g.name,
    platform: "Steam",
    genre: [],                 // 2단계에서 직접 태깅
    playtime_hours: Math.round((g.playtime_forever / 60) * 10) / 10,
    cleared: false,            // 2단계에서 직접 체크
    rating: null,              // 선택
    note: "",                  // 한 줄 평 직접 작성
  }))
  .filter((g) => g.playtime_hours >= MIN_HOURS)
  .sort((a, b) => b.playtime_hours - a.playtime_hours);

console.log(JSON.stringify(games, null, 2));
console.error(`\n변환 완료: ${games.length}개 (플레이타임 ${MIN_HOURS}시간 이상, 전체 ${raw.length}개 중)`);
