/* Playtime Archive — single source of truth: games.json
   요약숫자 · 테이블 · 하이라이트 · CSV 모두 이 데이터에서 파생 */

const state = {
  data: null,
  platform: "ALL",
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
  renderGenreChart();
  renderTables();
  renderHighlights();
  wireControls();

  const updated = state.data.profile?.updated;
  if (updated) $("#updated").textContent = updated;
}

function renderProfile() {
  const p = state.data.profile || {};
  if (p.handle) $("#handle").textContent = `// ${p.handle}`;
  if (p.name) $("#name").textContent = p.name;
  $("#tagline").textContent = p.tagline || "";
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

function currentGames(tier) {
  let games = (state.data.games || []).filter((g) => g.tier === tier);
  if (state.platform !== "ALL") {
    games = games.filter((g) => g.platform === state.platform);
  }
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

function renderTables() {
  // ① 깊게 파고든 게임 — 한 줄 평 포함 카드
  const deep = currentGames("deep");
  const deepMax = Math.max(1, ...deep.map((g) => g.playtime_hours || 0));
  $("#deep-list").innerHTML =
    deep
      .map(
        (g) => `
      <article class="gcard">
        <div class="gcard__top">
          <h3 class="gcard__title">${esc(g.title)}</h3>
          ${clearedBadge(g)}
        </div>
        <div class="gcard__meta"${steamGenreTitle(g)}><span class="gc gc--plat">${esc(g.platform)}</span>${genreChips(g.genre)}</div>
        <div class="gcard__time">${timeBar(g.playtime_hours, deepMax)}<span class="gcard__hrs">${fmtHours(g.playtime_hours)}</span></div>
        ${achRow(g)}
        ${g.note ? `<p class="gcard__note">${esc(g.note)}</p>` : ""}
      </article>`
      )
      .join("") || emptyMsg();

  // ② 그 외 — 컴팩트 카드 (리뷰 없음)
  const more = currentGames("more");
  const moreMax = Math.max(1, ...more.map((g) => g.playtime_hours || 0));
  $("#more-list").innerHTML =
    more
      .map(
        (g) => `
      <article class="gcard gcard--compact">
        <div class="gcard__top">
          <h3 class="gcard__title">${esc(g.title)}</h3>
          <span class="dot ${g.cleared ? "dot--yes" : ""}" title="${g.cleared ? "엔딩" : "진행"}"></span>
        </div>
        <div class="gcard__meta"${steamGenreTitle(g)}><span class="gc gc--plat">${esc(g.platform)}</span>${genreChips(g.genre)}</div>
        <div class="gcard__time">${timeBar(g.playtime_hours, moreMax)}<span class="gcard__hrs">${fmtHours(g.playtime_hours)}</span></div>
        ${achRow(g)}
      </article>`
      )
      .join("") || emptyMsg();

  const total = (state.data.games || []).filter((g) => g.tier === "more").length;
  const el = $("#more-count");
  if (el) el.textContent = more.length === total ? `장르별로 폭넓게 경험 · ${total}개` : `${more.length} / ${total}개 (필터 적용)`;
}

function emptyMsg() {
  return `<p class="empty">해당 플랫폼의 기록이 없습니다.</p>`;
}

function renderHighlights() {
  const hls = state.data.highlights || [];
  $("#highlights").innerHTML = hls
    .map(
      (h) => `
      <article class="hl">
        <h3 class="hl__title">${esc(h.title)}</h3>
        <div class="hl__block">
          <div class="hl__label fun">◆ 재미 요소</div>
          <p class="hl__text">${esc(h.fun || "")}</p>
        </div>
        <div class="hl__block">
          <div class="hl__label structure">◆ 구조적 이유</div>
          <p class="hl__text">${esc(h.structure || "")}</p>
        </div>
        <div class="hl__block">
          <div class="hl__label weakness">◆ 아쉬운 점</div>
          <p class="hl__text">${esc(h.weakness || "")}</p>
        </div>
      </article>`
    )
    .join("");
}

function wireControls() {
  $("#platform-filter").addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    state.platform = btn.dataset.platform;
    document.querySelectorAll("#platform-filter .chip").forEach((c) =>
      c.setAttribute("aria-pressed", String(c.dataset.platform === state.platform))
    );
    renderTables();
  });

  $("#sort-select").addEventListener("change", (e) => {
    state.sort = e.target.value;
    renderTables();
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
