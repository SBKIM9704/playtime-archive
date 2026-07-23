#!/usr/bin/env node
/**
 * 넥슨 FC 온라인 전적 조회 헬퍼 (선택 도구)
 *
 * 사용법:
 *   1) https://openapi.nexon.com 에서 넥슨 ID 로그인 → 애플리케이션 등록 → API Key 발급
 *   2) 실행 (키/닉네임은 환경변수로 주입 — 리포에 커밋 금지):
 *
 *      NEXON_KEY=test_xxxx NICKNAME='감독명' node scripts/fetch-nexon-fc.mjs
 *
 * 하는 일: 닉네임 → ouid → 역대 최고 등급(챌린저 증명) + 기본정보 조회.
 * 참고: 피파온라인2 등 종료된 서비스 데이터는 조회 불가. 현재 FC 온라인 계정만.
 */

const KEY = process.env.NEXON_KEY;
const NICK = process.env.NICKNAME;
const BASE = "https://open.api.nexon.com";

if (!KEY || !NICK) {
  console.error("NEXON_KEY 와 NICKNAME 환경변수가 필요합니다.");
  console.error("예: NEXON_KEY=test_xxxx NICKNAME='감독명' node scripts/fetch-nexon-fc.mjs");
  process.exit(1);
}

const headers = { "x-nxopen-api-key": KEY };

async function get(path) {
  const res = await fetch(BASE + path, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} @ ${path}\n${body}`);
  }
  return res.json();
}

try {
  // 1) 닉네임 → ouid
  const { ouid } = await get(`/fconline/v1/id?nickname=${encodeURIComponent(NICK)}`);
  console.error(`ouid: ${ouid}`);

  // 2) 기본정보
  const basic = await get(`/fconline/v1/user/basic?ouid=${ouid}`);

  // 3) 역대 최고 등급 + 등급 메타(코드→이름)
  const maxDiv = await get(`/fconline/v1/user/maximum-division?ouid=${ouid}`);
  let meta = [];
  try {
    meta = await get(`/static/fconline/meta/division.json`);
  } catch { /* 메타 실패해도 코드로 출력 */ }
  const nameOf = (id) => meta.find((m) => m.divisionId === id)?.divisionName ?? `코드 ${id}`;

  const best = (maxDiv || [])
    .map((d) => ({ matchType: d.matchType, division: nameOf(d.division), date: d.achievementDate }))
    .sort((a, b) => a.matchType - b.matchType);

  console.log(JSON.stringify({ nickname: basic.nickname, level: basic.level, ouid, maximumDivision: best }, null, 2));
  console.error("\n=== 요약 ===");
  console.error(`닉네임: ${basic.nickname} (Lv.${basic.level})`);
  best.forEach((b) => console.error(`  matchType ${b.matchType}: 역대 최고 ${b.division} (${b.date ?? "-"})`));
} catch (e) {
  console.error("조회 실패:\n" + e.message);
  console.error("\n닉네임이 정확한지, 계정이 활성 상태인지 확인하세요.");
  process.exit(1);
}
