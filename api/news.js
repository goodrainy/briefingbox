// ===============================
// 네이버 뉴스 검색 API 중계(프록시) 함수
// - 브라우저가 이 주소(/api/news)로 요청을 보내면,
//   이 함수가 대신 네이버 서버에 요청을 보내고 결과만 돌려줍니다.
// - 네이버 Client ID / Secret은 절대 프론트엔드(HTML/JS)에 적지 않고,
//   Vercel의 "환경 변수(Environment Variables)"에만 저장해서 이 함수에서만 사용합니다.
// ===============================

export default async function handler(req, res) {
  // query: 검색어 (카테고리명이든, 기사 제목 전체든 그냥 검색어로 받으면 됩니다)
  // display: 가져올 기사 개수 (안 보내면 5개, 최대 10개로 제한)
  const { query, display } = req.query; // 예: /api/news?query=경제&display=4

  if (!query) {
    res.status(400).json({ error: "검색어(query)가 필요합니다." });
    return;
  }

  let displayCount = parseInt(display, 10);
  if (!Number.isInteger(displayCount) || displayCount < 1) {
    displayCount = 5;
  } else if (displayCount > 10) {
    displayCount = 10;
  }

  // Vercel 프로젝트 설정 > Environment Variables 에 등록해둔 값을 읽어옵니다.
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.status(500).json({
      error: "네이버 API 키가 설정되지 않았습니다. Vercel 환경 변수를 확인하세요.",
    });
    return;
  }

  // sort=date: 최신순 정렬
  const apiUrl = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(
    query
  )}&display=${displayCount}&sort=date`;

  try {
    const naverResponse = await fetch(apiUrl, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });

    const data = await naverResponse.json();

    if (!naverResponse.ok) {
      // 네이버 쪽에서 에러가 온 경우 (키 오류, 요청 한도 초과 등) 그대로 전달
      res
        .status(naverResponse.status)
        .json({ error: data.errorMessage || "네이버 API 요청에 실패했습니다." });
      return;
    }

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: "서버에서 뉴스를 불러오는 중 오류가 발생했습니다." });
  }
}
