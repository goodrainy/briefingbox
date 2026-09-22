// ===============================
// 우리말샘(국립국어원) 검색 결과에서 뜻풀이를 가져오는 중계(프록시) 함수
//
// [왜 우리말샘인가] 네이버는 국어사전(어학사전)을 위한 공개 API가 없고, 네이버 국어사전 페이지 자체도
// 자바스크립트로 내용을 그리는 방식(SPA)이라 서버가 원문 HTML을 받아와도 뜻풀이가 비어 있어요.
// 우리말샘은 검색 결과 페이지를 서버가 완성해서 보내주기 때문에(=화면에 이미 다 그려진 채로 옴),
// API 키 없이도 그 안의 뜻풀이를 그대로 읽어올 수 있어요.
//
// [하는 일] 검색어와 표제어가 정확히 같은 단어의 뜻풀이(의미가 여러 개면 최대 3개)만 뽑아서 돌려줘요.
// 예: /api/dictionary?query=기준금리
// ===============================

const SEARCH_URL = "https://opendict.korean.go.kr/search/searchResult";

// 비교할 때 붙임표(^)와 띄어쓰기를 무시해요. ("서킷^브레이커" = "서킷 브레이커" = "서킷브레이커")
function normalize(text) {
  return String(text).replace(/[\s^]/g, "").toLowerCase();
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export default async function handler(req, res) {
  const { query } = req.query;

  if (!query || !query.trim()) {
    res.status(400).json({ error: "검색어(query)가 필요합니다." });
    return;
  }

  const keyword = query.trim();

  try {
    const response = await fetch(`${SEARCH_URL}?query=${encodeURIComponent(keyword)}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) {
      res.status(502).json({ error: "우리말샘 서버에 연결하지 못했습니다." });
      return;
    }

    const html = await response.text();
    const target = normalize(keyword);

    // 표제어 단위(<dl>...</dl>)로 나눠서, 찾는 말과 정확히 같은 표제어의 뜻풀이만 골라요.
    // (예: "인플레이션"을 찾을 때 "인플레이션^갭" 같은 다른 복합어는 걸러내요)
    // "은행"(銀行/銀杏처럼 뜻이 전혀 다른 동음이의어)은 표제어가 여러 <dl> 블록으로 나뉘어 있어서,
    // 첫 블록에서 멈추지 않고 최대 3개가 모일 때까지 여러 블록에 걸쳐 뜻을 모아요.
    // (그래야 엉뚱한 뜻 하나만 뜨지 않고, 사용자가 여러 후보 중에서 맞는 뜻을 고를 수 있어요)
    const blocks = html.split("<dl>").slice(1);
    const entries = [];

    for (const block of blocks) {
      if (entries.length >= 3) break;

      const headwordMatch = block.match(/class="search_word_type1_17"[^>]*>([^<]*)/);
      if (!headwordMatch) continue;
      if (normalize(headwordMatch[1]) !== target) continue;

      // 이 표제어 안의 뜻풀이(의미가 여러 개면 001, 002...)를 전부 찾아요.
      const senseRegex = /<a href="\/dictionary\/view\?sense_no=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
      let senseMatch;
      while ((senseMatch = senseRegex.exec(block)) && entries.length < 3) {
        const senseNo = senseMatch[1];
        const senseHtml = senseMatch[2];

        const meaningMatch = senseHtml.match(/class="word_dis[^"]*"[^>]*>([^<]*)/);
        if (!meaningMatch || !meaningMatch[1].trim()) continue;

        const posMatch = senseHtml.match(/class="word_att_type1[^"]*"[^>]*>([^<]*)/);
        const fieldMatch = senseHtml.match(/class="word_att_type2[^"]*"[^>]*>([^<]*)/);

        entries.push({
          meaning: decodeEntities(meaningMatch[1].trim()),
          pos: posMatch ? decodeEntities(posMatch[1].trim()) : "",
          field: fieldMatch ? decodeEntities(fieldMatch[1].trim()) : "",
          url: `https://opendict.korean.go.kr/dictionary/view?sense_no=${senseNo}&viewType=confirm`,
        });
      }
    }

    res.status(200).json({
      term: keyword,
      entries,
      sourceUrl: `https://opendict.korean.go.kr/search/searchResult?query=${encodeURIComponent(keyword)}`,
    });
  } catch (error) {
    res.status(500).json({ error: "사전을 불러오는 중 오류가 발생했습니다." });
  }
}
