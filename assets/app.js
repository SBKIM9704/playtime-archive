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
  $("#intro").textContent = p.intro || "";
  document.title = `${p.name || "Playtime"} — 게임 플레이 이력`;
}

function renderStats() {
  const games = state.data.games || [];
  const totalMinutesFree = games.reduce((s, g) => s + (g.playtime_hours || 0), 0);
  const cleared = games.filter((g) => g.cleared).length;
  const platforms = new Set(games.map((g) => g.platform)).size;
  const totalHours = Math.round(totalMinutesFree);

  const cards = [
    { num: games.length, unit: "개", label: "기록된 게임", accent: false },
    { num: cleared, unit: "개", label: "엔딩 · 클리어", accent: true },
    { num: totalHours.toLocaleString("ko-KR"), unit: "시간", label: "누적 플레이타임", accent: false },
    { num: platforms, unit: "종", label: "플랫폼", accent: false },
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
    if (s === "rating") return (b.rating || 0) - (a.rating || 0);
    return (b.playtime_hours || 0) - (a.playtime_hours || 0); // playtime
  });
  return games;
}

// 플레이타임 표시: null/미상은 "—"
function fmtTime(h) {
  if (h == null) return `<span class="g-time g-time--na">—</span>`;
  return `<span class="g-time">${h.toLocaleString("ko-KR")}<span class="unit">h</span></span>`;
}
function cellsCommon(g) {
  return `
        <td class="col-title"><span class="g-title">${esc(g.title)}</span></td>
        <td class="col-plat"><span class="g-plat">${esc(g.platform)}</span></td>
        <td class="col-genre"><span class="g-genre">${(g.genre || []).map(esc).join(" · ")}</span></td>
        <td class="col-time">${fmtTime(g.playtime_hours)}</td>
        <td class="col-clear"><span class="g-clear ${g.cleared ? "yes" : "no"}">${g.cleared ? "● 클리어" : "○ 진행"}</span></td>`;
}

function renderTables() {
  // ① 깊게 파고든 게임 — 한 줄 평 포함
  const deep = currentGames("deep")
    .map((g) => `<tr>${cellsCommon(g)}<td class="col-note"><span class="g-note">${esc(g.note || "")}</span></td></tr>`)
    .join("");
  $("#games-body").innerHTML = deep || emptyRow(6);

  // ② 그 외 플레이한 게임 — 컴팩트 (리뷰 열 없음)
  const moreGames = currentGames("more");
  const more = moreGames.map((g) => `<tr>${cellsCommon(g)}</tr>`).join("");
  $("#more-body").innerHTML = more || emptyRow(5);

  const total = (state.data.games || []).filter((g) => g.tier === "more").length;
  const shown = moreGames.length;
  const el = $("#more-count");
  if (el) el.textContent = shown === total ? `장르별로 폭넓게 경험 · ${total}개` : `${shown} / ${total}개 (필터 적용)`;
}

function emptyRow(cols) {
  return `<tr><td colspan="${cols}" style="padding:24px;color:var(--ink-faint)">해당 플랫폼의 기록이 없습니다.</td></tr>`;
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
  const header = ["타이틀", "플랫폼", "장르", "플레이타임(시간)", "클리어", "평점", "구분", "한줄평"];
  const lines = [header, ...games.map((g) => [
    g.title,
    g.platform,
    (g.genre || []).join(" / "),
    g.playtime_hours ?? "",
    g.cleared ? "Y" : "N",
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
