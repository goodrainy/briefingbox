// ===============================
// 네이버 백과사전 검색 API 중계(프록시) 함수
// - 브라우저가 /api/dictionary?query=기준금리 로 요청하면,
//   이 함수가 대신 네이버 서버에 백과사전 검색을 요청하고 필요한 정보만 돌려줍니다.
// - 뉴스 검색(api/news.js)과 같은 앱의 같은 키(NAVER_CLIENT_ID / NAVER_CLIENT_SECRET)를 사용해요.
//   (NAVER API HUB 콘솔에서 이 앱에 "백과사전" API가 추가되어 있어야 합니다.)
// ===============================

const HUB_SEARCH_BASE = "https://naverapihub.apigw.ntruss.com/search/v1";

// 문서에 주소가 두 가지로 적혀 있어서, 먼저 encyc를 시도하고 "없음(404)"이면 encyclopedia를 시도해요.
const ENCYC_PATHS = ["encyc", "encyclopedia"];

export default async function handler(req, res) {
  const query = String(req.query.query || "").trim().slice(0, 50);

  if (!query) {
    res.status(400).json({ error: "검색어(query)가 필요합니다." });
    return;
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.status(500).json({
      error: "네이버 API 키가 설정되지 않았습니다. Vercel 환경 변수를 확인하세요.",
    });
    return;
  }

  let lastStatus = 500;
  let lastMessage = "";

  for (const path of ENCYC_PATHS) {
    try {
      const apiUrl = `${HUB_SEARCH_BASE}/${path}?query=${encodeURIComponent(query)}&display=5`;
      const naverResponse = await fetch(apiUrl, {
        headers: {
          "X-NCP-APIGW-API-KEY-ID": clientId,
          "X-NCP-APIGW-API-KEY": clientSecret,
        },
      });

      const data = await naverResponse.json().catch(() => ({}));

      if (naverResponse.ok) {
        const items = (data.items || []).map(({ title, link, description, thumbnail }) => ({
          title,
          link,
          description,
          thumbnail,
        }));
        res.status(200).json({ items });
        return;
      }

      lastStatus = naverResponse.status;
      lastMessage = data.errorMessage || data.message || "";

      // 주소를 못 찾은 경우(404)에만 다른 주소를 시도하고, 그 외 오류(키 오류 등)는 바로 알려줘요.
      if (naverResponse.status !== 404) break;
    } catch (error) {
      lastStatus = 500;
      lastMessage = String(error);
    }
  }

  res.status(lastStatus).json({
    error: `백과사전 검색에 실패했습니다. (${lastStatus}) ${lastMessage}`.trim(),
  });
}
