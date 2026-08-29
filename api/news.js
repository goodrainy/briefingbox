// api/news.js
//
// 이 파일이 하는 일: 브라우저(index.html)가 직접 네이버 API를 부르면
// Client ID/Secret이 노출되니까, 대신 이 서버 함수가 네이버 API를 불러주고
// 그 결과만 브라우저에게 돌려줌.
//
// 브라우저 입장에서는 "/api/news?category=ai" 같은 우리 집 주소만 알면 되고,
// 네이버 API 주소나 비밀 키는 전혀 몰라도 됨 (이게 이 파일의 핵심 역할).

// 카테고리별로 네이버에 어떤 단어로 검색할지 미리 정해둠
// 나중에 검색어를 바꾸고 싶으면 이 표만 수정하면 됨
const CATEGORY_QUERY = {
  ai: "인공지능",
  econ: "경제 경영",
  money: "재테크 투자"
};

export default async function handler(req, res) {
  const category = req.query.category || "ai";
  const query = CATEGORY_QUERY[category] || CATEGORY_QUERY.ai;

  // 여기 두 값은 코드에 직접 쓰지 않고, Vercel의 "환경변수" 설정에 등록해둔 값을 불러옴
  // (Vercel 프로젝트 설정 → Environment Variables 에서
  //  NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 이름으로 등록하면 됨)
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    // 아직 환경변수를 등록 안 했을 때 나오는 안내 메시지
    return res.status(500).json({
      error: "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 설정되지 않았어요. Vercel 프로젝트 설정에서 등록해주세요."
    });
  }

  try {
    // 네이버 뉴스 검색 API를 서버 쪽에서 대신 호출
    const naverUrl = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=10&sort=date`;

    const naverRes = await fetch(naverUrl, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret
      }
    });

    if (!naverRes.ok) {
      throw new Error(`네이버 API 응답 오류: ${naverRes.status}`);
    }

    const data = await naverRes.json();

    // 네이버가 주는 데이터를 우리 화면(index.html)이 쓰기 편한 형태로 살짝 정리
    // (title/link에 남아있는 <b> 태그 같은 HTML 표시 제거)
    const articles = data.items.map(item => ({
      title: stripHtml(item.title),
      summary: stripHtml(item.description),
      category: category,
      date: (item.pubDate || "").slice(0, 16), // 날짜 앞부분만 간단히 사용
      link: item.originallink || item.link
    }));

    res.status(200).json({ articles });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "뉴스를 불러오는 중 문제가 발생했어요." });
  }
}

// 네이버 응답에 섞여있는 <b>, &quot; 같은 HTML 조각을 제거하는 작은 도우미 함수
function stripHtml(text){
  return (text || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'");
}
