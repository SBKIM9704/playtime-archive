/* Playtime Archive — single source of truth: games.json
   요약숫자 · 테이블 · 하이라이트 · CSV 모두 이 데이터에서 파생 */

const state = {
  data: null,
  platform: "ALL",
  ending: "ALL",
  sort: "playtime",
};

const $ = (sel) => document.querySelector(sel);

init();

async function init() {
  try {
    const res = await fetch("./games.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`games.json ${res.status}`);
    state.data = await res.json();
  } catch (err) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<p style="padding:24px;color:#f2565b;font-family:monospace">데이터 로드 실패: ${err.message}<br>로컬에서는 <code>python3 -m http.server</code> 로 실행하세요 (file://에서는 fetch가 막힙니다).</p>`
    );
    return;
  }

  renderProfile();
  renderStats();
  buildPlatformFilter();
  buildEndingFilter();
  renderGenreChart();
  renderList();
  wireControls();

  const updated = state.data.profile?.updated;
  if (updated) $("#updated").textContent = updated;
}

function renderProfile() {
  const p = state.data.profile || {};
  if (p.handle) $("#handle").textContent = `// ${p.handle}`;
  if (p.name) $("#name").textContent = p.name;
  // 각 항목을 nowrap 단위로 묶고 " · " 에서만 줄바꿈 (없으면 숨김)
  const tagEl = $("#tagline");
  if (p.tagline) {
    tagEl.style.display = "";
    tagEl.innerHTML = p.tagline
      .split(" · ")
      .map((s) => `<span class="tag-item">${esc(s)}</span>`)
      .join('<span class="tag-sep"> · </span>');
  } else {
    tagEl.style.display = "none";
  }
  const introEl = $("#intro");
  if (p.intro) { introEl.textContent = p.intro; introEl.style.display = ""; }
  else { introEl.style.display = "none"; }
  document.title = `${p.name || "Playtime"} — 게임 플레이 이력`;
}

function renderStats() {
  const games = state.data.games || [];
  const totalMinutesFree = games.reduce((s, g) => s + (g.playtime_hours || 0), 0);
  const cleared = games.filter((g) => g.cleared).length;
  const totalHours = Math.round(totalMinutesFree);

  const cards = [
    { num: games.length, unit: "개", label: "기록된 게임", accent: false },
    { num: cleared, unit: "개", label: "엔딩 · 클리어", accent: true },
    { num: totalHours.toLocaleString("ko-KR"), unit: "시간", label: "누적 플레이타임", accent: false },
  ];

  $("#stats").innerHTML = cards
    .map(
      (c) => `
      <div class="stat${c.accent ? " stat--accent" : ""}">
        <div class="stat__num">${c.num}<span class="unit">${c.unit}</span></div>
        <div class="stat__label">${c.label}</div>
      </div>`
    )
    .join("");
}

function buildPlatformFilter() {
  const platforms = ["ALL", ...new Set((state.data.games || []).map((g) => g.platform))];
  $("#platform-filter").innerHTML = platforms
    .map(
      (p) =>
        `<button class="chip" role="button" data-platform="${p}" aria-pressed="${
          p === state.platform
        }">${p === "ALL" ? "전체" : p}</button>`
    )
    .join("");
}

function buildEndingFilter() {
  const games = state.data.games || [];
  const cleared = games.filter((g) => g.cleared).length;
  const opts = [
    ["ALL", `전체 ${games.length}`],
    ["cleared", `엔딩 ${cleared}`],
    ["progress", `진행 ${games.length - cleared}`],
  ];
  $("#ending-filter").innerHTML = opts
    .map(
      ([v, label]) =>
        `<button class="chip" role="button" data-ending="${v}" aria-pressed="${v === state.ending}">${label}</button>`
    )
    .join("");
}

function currentGames() {
  let games = [...(state.data.games || [])];
  if (state.platform !== "ALL") games = games.filter((g) => g.platform === state.platform);
  if (state.ending === "cleared") games = games.filter((g) => g.cleared);
  else if (state.ending === "progress") games = games.filter((g) => !g.cleared);
  const s = state.sort;
  games.sort((a, b) => {
    if (s === "title") return a.title.localeCompare(b.title, "ko");
    if (s === "achievement") return (b.achievement_pct ?? -1) - (a.achievement_pct ?? -1);
    return (b.playtime_hours || 0) - (a.playtime_hours || 0); // playtime
  });
  return games;
}

// ---------- 카드 렌더 헬퍼 ----------
const fmtHours = (h) => (h == null ? "—" : h.toLocaleString("ko-KR") + "h");
const genreChips = (gs) => (gs || []).map((g) => `<span class="gc">${esc(g)}</span>`).join("");
// Steam 공식 장르(API) 검증 레이어 — 카드 hover 툴팁
const steamGenreTitle = (g) =>
  g.steam_genres && g.steam_genres.length ? ` title="Steam 공식 장르: ${esc(g.steam_genres.join(", "))}"` : "";
const clearedBadge = (g) =>
  `<span class="badge ${g.cleared ? "badge--yes" : "badge--no"}">${g.cleared ? "● 엔딩" : "○ 진행"}</span>`;

// tier 내 최대값 대비 플레이타임 바
function timeBar(h, max) {
  const pct = h == null || !max ? 0 : Math.max(3, Math.round((h / max) * 100));
  return `<div class="pbar"><div class="pbar__fill" style="width:${pct}%"></div></div>`;
}

// 과제(실적) 달성률 행 — 실적 없는 게임은 표시 안 함
function achRow(g) {
  if (g.achievement_pct == null) return "";
  const p = g.achievement_pct;
  const done = g.achievement_done, total = g.achievement_total;
  return `<div class="gcard__ach" title="업적 ${done}/${total} 달성">
        <div class="abar"><div class="abar__fill" style="width:${Math.max(3, p)}%"></div></div>
        <span class="gcard__achv">업적 ${p}%</span>
      </div>`;
}

// 장르 분포 막대 (전체 데이터 기준 · 필터 무관)
function renderGenreChart() {
  const counts = {};
  (state.data.games || []).forEach((g) => (g.genre || []).forEach((x) => (counts[x] = (counts[x] || 0) + 1)));
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] : 1;
  const top = entries.slice(0, 14);
  const sub = $("#genre-sub");
  if (sub) sub.textContent = `${entries.length}개 장르 · 상위 ${top.length}`;
  $("#genre-chart").innerHTML = top
    .map(
      ([name, n]) => `
      <div class="gbar">
        <div class="gbar__label">${esc(name)}</div>
        <div class="gbar__track"><div class="gbar__fill" style="width:${Math.round((n / max) * 100)}%"></div></div>
        <div class="gbar__n">${n}</div>
      </div>`
    )
    .join("");
}

// 이미지 증빙이 있는 카드 (모바일 종합 등) — 넓게, 텍스트+이미지
function imageCard(g) {
  return `
      <article class="gcard gcard--wide">
        <div class="gcard__wideinfo">
          <div class="gcard__top"><h3 class="gcard__title">${esc(g.title)}</h3></div>
          <div class="gcard__meta"><span class="gc gc--plat">${esc(g.platform)}</span></div>
          ${g.note ? `<p class="gcard__note">${esc(g.note)}</p>` : ""}
        </div>
        <a class="gcard__imgwrap" href="${esc(g.image)}" target="_blank" rel="noopener" title="원본 크게 보기">
          <img class="gcard__img" src="${esc(g.image)}" alt="${esc(g.title)} 업적 증빙" loading="lazy">
        </a>
      </article>`;
}

// 통합 게임 이력 리스트 — 필터/정렬 적용
function renderList() {
  const games = currentGames();
  const max = Math.max(1, ...games.map((g) => g.playtime_hours || 0));
  $("#game-list").innerHTML =
    games
      .map((g) =>
        g.image
          ? imageCard(g)
          : `
      <article class="gcard">
        <div class="gcard__top">
          <h3 class="gcard__title">${esc(g.title)}</h3>
          ${clearedBadge(g)}
        </div>
        <div class="gcard__meta"${steamGenreTitle(g)}><span class="gc gc--plat">${esc(g.platform)}</span>${genreChips(g.genre)}</div>
        <div class="gcard__time">${timeBar(g.playtime_hours, max)}<span class="gcard__hrs">${fmtHours(g.playtime_hours)}</span></div>
        ${achRow(g)}
        ${g.note ? `<p class="gcard__note">${esc(g.note)}</p>` : ""}
        ${proofBlock(g)}
      </article>`
      )
      .join("") || emptyMsg();

  const total = (state.data.games || []).length;
  const el = $("#list-count");
  if (el) el.textContent = games.length === total ? `· ${total}개` : `· ${games.length} / ${total}`;
}

function emptyMsg() {
  return `<p class="empty">조건에 맞는 게임이 없습니다.</p>`;
}

// 엔딩 증빙 — Steam 공식 도전과제 캡처를 카드에 삽입
function proofBlock(g) {
  if (!g.proof || !g.proof.image) return "";
  return `<a class="gcard__proof" href="${esc(g.proof.url)}" target="_blank" rel="noopener"
        title="Steam 공식 검증 · ${esc(g.proof.ach)} (${esc(g.proof.date)})">
        <span class="gcard__proofcap">✔ 엔딩 증빙 (Steam)</span>
        <img src="${esc(g.proof.image)}" alt="${esc(g.title)} 엔딩 도전과제 증빙" loading="lazy">
      </a>`;
}


function wireControls() {
  $("#platform-filter").addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    state.platform = btn.dataset.platform;
    document.querySelectorAll("#platform-filter .chip").forEach((c) =>
      c.setAttribute("aria-pressed", String(c.dataset.platform === state.platform))
    );
    renderList();
  });

  $("#ending-filter").addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    state.ending = btn.dataset.ending;
    document.querySelectorAll("#ending-filter .chip").forEach((c) =>
      c.setAttribute("aria-pressed", String(c.dataset.ending === state.ending))
    );
    renderList();
  });

  $("#sort-select").addEventListener("change", (e) => {
    state.sort = e.target.value;
    renderList();
  });

  $("#csv-btn").addEventListener("click", exportCSV);
}

/* CSV export — 5단계 스프레드시트 정식 제출용, 같은 데이터에서 파생 */
function exportCSV() {
  const games = state.data.games || [];
  const header = ["타이틀", "플랫폼", "장르(큐레이션)", "Steam공식장르", "플레이타임(시간)", "클리어", "업적%", "평점", "구분", "한줄평"];
  const lines = [header, ...games.map((g) => [
    g.title,
    g.platform,
    (g.genre || []).join(" / "),
    (g.steam_genres || []).join(" / "),
    g.playtime_hours ?? "",
    g.cleared ? "Y" : "N",
    g.achievement_pct ?? "",
    g.rating ?? "",
    g.tier === "deep" ? "깊게" : "그외",
    g.note || "",
  ])];
  // BOM for Excel/Google Sheets Korean encoding
  const csv = "﻿" + lines.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `playtime-archive-${state.data.profile?.updated || "export"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
