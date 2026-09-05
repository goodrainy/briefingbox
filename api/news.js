// ===============================
// 네이버 뉴스 검색 API 중계(프록시) 함수
// - 브라우저가 이 주소(/api/news)로 요청을 보내면,
//   이 함수가 대신 네이버 서버에 요청을 보내고 결과만 돌려줍니다.
// - 네이버 Client ID / Secret은 절대 프론트엔드(HTML/JS)에 적지 않고,
//   Vercel의 "환경 변수(Environment Variables)"에만 저장해서 이 함수에서만 사용합니다.
// ===============================

export default async function handler(req, res) {
  // query: 검색어 (카테고리명이든, 기사 제목 전체든 그냥 검색어로 받으면 됩니다)
  // display: 가져올 기사 개수 (안 보내면 5개, 최대 30개로 제한)
  // - "핫한 기사" 골라내기 기능이 여러 기사를 비교해서 골라야 해서, 카테고리 요약 화면에서는
  //   더 큰 후보군(예: 20개)을 요청한 뒤 그중 화제성 높은 기사만 추려서 보여줘요.
  const { query, display } = req.query; // 예: /api/news?query=경제&display=20

  if (!query) {
    res.status(400).json({ error: "검색어(query)가 필요합니다." });
    return;
  }

  let displayCount = parseInt(display, 10);
  if (!Number.isInteger(displayCount) || displayCount < 1) {
    displayCount = 5;
  } else if (displayCount > 30) {
    displayCount = 30;
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
  // 주의: 이 프로젝트는 "NAVER API HUB"(console.ncloud.com)에서 발급받은 키를 사용해요.
  // 예전 개발자센터(developers.naver.com) 방식과 주소·헤더 이름이 다릅니다.
  const apiUrl = `https://naverapihub.apigw.ntruss.com/search/v1/news?query=${encodeURIComponent(
    query
  )}&display=${displayCount}&sort=date`;

  try {
    const naverResponse = await fetch(apiUrl, {
      headers: {
        "X-NCP-APIGW-API-KEY-ID": clientId,
        "X-NCP-APIGW-API-KEY": clientSecret,
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
