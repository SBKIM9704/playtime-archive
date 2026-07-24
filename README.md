# Playtime Archive

이력서 보조용 **게임 플레이 이력 증명** 정적 사이트. 링크 하나로 장르별 플레이 폭 · 엔딩(클리어) 기록 · 게임 디자인 분석(하이라이트)을 보여줍니다.

- 백엔드 없음 · 빌드 스텝 없음 (vanilla HTML/CSS/JS)
- 데이터(`games.json`)와 뷰(`index.html`)가 분리돼 있어 게임 추가가 쉽습니다
- 요약 숫자 · 카드 · CSV 내보내기가 모두 `games.json` **한 소스**에서 파생됩니다

## 데이터 출처 (투명성)

| 항목 | 출처 |
|---|---|
| 플레이타임 | **Steam Web API 실측** (`GetOwnedGames`) |
| 업적 달성률(업적%) | **Steam Web API 실측** (`GetPlayerAchievements`) |
| `steam_genres` (Steam 공식 장르) | **Steam 상점 API 실측** (`appdetails`) |
| 화면 표시 장르 (`genre`) | 직접 **큐레이션** (세부 장르 — 로그라이크/덱빌딩 등). 카드 hover 시 Steam 공식 장르 툴팁 표시 |
| 엔딩(클리어) 여부 | 본인 확인 (플레이 기억 기반) |
| FC 온라인 등급 | **넥슨 오픈 API 실측** |

> 즉 플레이타임·실적·공식장르는 API 실측이고, 화면의 세부 장르만 큐레이션입니다 (공식 장르는 `steam_genres`·CSV에 병기).

```
index.html            단일 페이지
games.json            데이터 (여기만 수정하면 됨)
assets/style.css      스타일
assets/app.js         렌더링 로직
scripts/fetch-steam.mjs   (선택) Steam API → games.json 변환 헬퍼
```

## 로컬에서 보기

`fetch`는 `file://`에서 막히므로 정적 서버로 띄웁니다:

```bash
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000
```

## 데이터 갱신하는 법

`games.json` 만 수정하면 됩니다.

**게임 항목** (`games` 배열):

```json
{
  "title": "게임 이름",
  "platform": "Steam",              // Steam / PS5 / Xbox / Switch / PC
  "genre": ["RPG", "턴제전략"],
  "playtime_hours": 118,
  "cleared": true,                  // 엔딩/클리어 = 신뢰성의 핵심
  "rating": 10,                     // 1~10, 선택
  "note": "한 줄 평"
}
```

**하이라이트 항목** (`highlights` 배열) — 3단 구조 고정:

```json
{
  "title": "게임 이름",
  "fun": "재미 요소",
  "structure": "구조적 이유 (왜 그렇게 설계됐는가)",
  "weakness": "아쉬운 점"
}
```

### Steam 목록 자동 수집 (선택)

```bash
# 1) 스팀 프로필 공개 전환  2) https://steamcommunity.com/dev/apikey 에서 키 발급
STEAM_KEY=xxxx STEAM_ID=7656119xxxxxxxxxx node scripts/fetch-steam.mjs > steam-games.json
```

출력된 항목을 `games.json`의 `games`에 붙여넣고 장르·`cleared`·한 줄 평을 채웁니다.
(키/스팀ID는 절대 커밋하지 마세요 — 환경변수로만 주입.)

넥슨 FC 온라인 전적은 [넥슨 오픈 API](https://openapi.nexon.com), PSN/Xbox/Switch는 수동 입력.

## 배포 (GitHub Pages)

```bash
git add -A && git commit -m "init playtime archive"
git branch -M main && git remote add origin <repo-url> && git push -u origin main
```

GitHub → repo **Settings → Pages → Source: `main` / `(root)`** →
`https://<username>.github.io/playtime-archive` 에 게시됩니다. 정적 파일뿐이라 별도 워크플로가 필요 없습니다.

## 스프레드시트 내보내기

사이트 하단 **↓ CSV 내보내기** 버튼 → 구글 시트/엑셀로 열어 정식 제출용 파일로 사용. (한글 인코딩용 BOM 포함)
