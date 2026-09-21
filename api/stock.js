// ===============================
// KRX(한국거래소) Open API 중계(프록시) 함수
// - 브라우저가 이 주소(/api/stock?name=삼성전자)로 요청을 보내면,
//   이 함수가 대신 KRX 서버에 요청을 보내고 필요한 정보만 정리해서 돌려줍니다.
// - KRX_API_KEY는 절대 프론트엔드(HTML/JS)에 적지 않고,
//   Vercel의 "환경 변수(Environment Variables)"에만 저장해서 이 함수에서만 사용합니다.
//
// [사용법]
// - /api/stock?name=삼성전자                 → 가장 최근 거래일의 종가·등락률
// - /api/stock?name=삼성전자&date=20260915   → 그 날짜(주말·휴일이면 다음 거래일)의 종가·등락률
//   ("내 판단 돌아보기"에서 과거 주가를 확인할 때 써요. &code=005930 을 함께 보내면 조회가 더 빨라요.)
//
// [중요] KRX Open API의 특징
// "종목기본정보"와 "일별매매정보" 두 API 모두, 종목코드로 하나만 딱 찍어서
// 조회하는 방식이 아니라 "그날 유가증권시장(KOSPI) 전체 종목"을 한 번에 돌려줍니다.
// 그래서 원하는 종목은 응답 배열(OutBlock_1) 안에서 이름/코드로 직접 찾아야 해요.
// 두 API 응답에 공통으로 들어있는 ISU_CD(표준코드)를 연결고리로 사용합니다.
// 또 이 API는 실시간 시세가 아니라, 장이 끝난 뒤 확정되는 "일별 종가" 데이터예요.
// ===============================

const BASE_INFO_URL = "https://data-dbg.krx.co.kr/svc/apis/sto/stk_isu_base_info";
const TRADE_INFO_URL = "https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd";

// Date 객체를 KRX가 요구하는 YYYYMMDD 문자열로 변환
function formatBasDd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

// KRX API 한 번 호출해서 OutBlock_1 배열만 뽑아오는 함수
async function fetchKrxOutBlock(url, authKey, basDd) {
  const requestUrl = `${url}?basDd=${basDd}`;

  const response = await fetch(requestUrl, {
    headers: {
      "Content-Type": "application/json",
      AUTH_KEY: authKey,
    },
  });

  if (!response.ok) {
    throw new Error(`KRX API 요청 실패 (status ${response.status})`);
  }

  const data = await response.json();
  return Array.isArray(data.OutBlock_1) ? data.OutBlock_1 : [];
}

// 주말/공휴일에는 그날 데이터가 아예 없어서 빈 배열이 돌아와요.
// basDd를 지정하지 않으면 오늘부터 최대 10일 전까지 하루씩 거슬러 올라가며
// 데이터가 있는 가장 최근 거래일을 찾습니다. (fixedBasDd가 있으면 그 날짜만 그대로 사용)
async function fetchKrxWithFallback(url, authKey, fixedBasDd) {
  if (fixedBasDd) {
    const items = await fetchKrxOutBlock(url, authKey, fixedBasDd);
    return { basDd: fixedBasDd, items };
  }

  const today = new Date();
  for (let i = 0; i < 10; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const basDd = formatBasDd(date);

    const items = await fetchKrxOutBlock(url, authKey, basDd);
    if (items.length > 0) {
      return { basDd, items };
    }
  }

  throw new Error("최근 거래일 데이터를 찾을 수 없습니다.");
}

// 지정한 날짜부터 하루씩 "앞으로" 가며, 데이터가 있는 첫 거래일을 찾아요. (최대 7일, 오늘까지만)
// 주말·휴일에 나온 기사는 그다음 거래일의 주가와 비교하기 위해 써요.
// 아직 데이터가 올라오지 않은 날짜면 null을 돌려줘요.
async function fetchKrxFromDate(url, authKey, startBasDd) {
  const start = new Date(
    Number(startBasDd.slice(0, 4)),
    Number(startBasDd.slice(4, 6)) - 1,
    Number(startBasDd.slice(6, 8))
  );
  const today = new Date();

  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    if (date > today) break;

    const basDd = formatBasDd(date);
    const items = await fetchKrxOutBlock(url, authKey, basDd);
    if (items.length > 0) {
      return { basDd, items };
    }
  }

  return null;
}

// 종목기본정보 목록에서 이름으로 종목을 찾아요. (이름이 똑같은 것을 먼저, 없으면 포함된 것)
function findStockByName(baseInfoItems, keyword) {
  return (
    baseInfoItems.find(
      (item) => item.ISU_NM === keyword || item.ISU_ABBRV === keyword
    ) ||
    baseInfoItems.find(
      (item) =>
        (item.ISU_NM && item.ISU_NM.includes(keyword)) ||
        (item.ISU_ABBRV && item.ISU_ABBRV.includes(keyword))
    )
  );
}

export default async function handler(req, res) {
  const { name, date, code } = req.query; // 예: /api/stock?name=삼성전자

  if (!name) {
    res.status(400).json({ error: "종목명(name)이 필요합니다." });
    return;
  }

  if (date && !/^\d{8}$/.test(date)) {
    res.status(400).json({ error: "날짜(date)는 YYYYMMDD 형식이어야 합니다." });
    return;
  }

  const authKey = process.env.KRX_API_KEY;
  if (!authKey) {
    res.status(500).json({ error: "KRX API 키가 설정되지 않았습니다. Vercel 환경 변수를 확인하세요." });
    return;
  }

  try {
    const keyword = name.trim();

    // ----- 날짜를 지정한 경우: 그 날짜(또는 다음 거래일)의 시세만 돌려줘요 -----
    if (date) {
      const found = await fetchKrxFromDate(TRADE_INFO_URL, authKey, date);
      if (!found) {
        res.status(404).json({ error: "이 날짜의 종가 데이터가 아직 없어요.", noData: true });
        return;
      }

      // 종목코드(6자리)를 받았으면 종목기본정보 조회를 건너뛰어서 요청을 한 번 아껴요.
      let shortCode = /^\d{6}$/.test(code || "") ? code : null;
      if (!shortCode) {
        const { items: baseInfoItems } = await fetchKrxWithFallback(BASE_INFO_URL, authKey, found.basDd);
        const matchedStock = findStockByName(baseInfoItems, keyword);
        if (!matchedStock) {
          res.status(404).json({ error: `"${keyword}" 종목을 유가증권시장(KOSPI)에서 찾을 수 없어요.` });
          return;
        }
        shortCode = matchedStock.ISU_SRT_CD;
      }

      const dayRow = found.items.find((item) => item.ISU_CD === shortCode);
      if (!dayRow) {
        res.status(404).json({ error: `"${keyword}"의 시세 정보를 찾을 수 없어요.` });
        return;
      }

      res.status(200).json({
        name: dayRow.ISU_NM || keyword,
        code: shortCode,
        baseDate: dayRow.BAS_DD,
        closePrice: dayRow.TDD_CLSPRC,
        change: dayRow.CMPPREVDD_PRC,
        changeRate: dayRow.FLUC_RT,
      });
      return;
    }

    // ----- 날짜가 없으면: 가장 최근 거래일 시세 -----
    // 1단계: 일별매매정보 기준으로 "실제 시세 데이터가 있는 가장 최근 거래일"을 먼저 찾습니다.
    //
    // [주의] 종목기본정보는 회사 기본 정보라서 거래일이 아니어도(예: 당일 장 마감 직후,
    // 데이터가 아직 안 올라온 시점) 데이터가 존재할 수 있어요. 하지만 일별매매정보는
    // 실제로 그날 거래가 이뤄지고 데이터가 집계되어야만 존재해요. 그래서 순서를 바꿔서
    // "시세가 실제로 있는 날짜"를 먼저 확정한 뒤, 그 날짜로 종목 정보를 조회해야
    // 두 데이터의 기준일자가 어긋나지 않습니다.
    const { basDd, items: tradeItems } = await fetchKrxWithFallback(
      TRADE_INFO_URL,
      authKey
    );

    // 2단계: 확정된 기준일자로 종목기본정보를 가져와서 이름으로 종목 찾기
    const { items: baseInfoItems } = await fetchKrxWithFallback(
      BASE_INFO_URL,
      authKey,
      basDd
    );

    const matched = findStockByName(baseInfoItems, keyword);

    if (!matched) {
      res.status(404).json({ error: `"${keyword}" 종목을 유가증권시장(KOSPI)에서 찾을 수 없어요.` });
      return;
    }

    // [주의] 두 API 모두 필드 이름은 똑같이 "ISU_CD"이지만, 실제 값의 형식이 서로 달라요.
    // - 종목기본정보의 ISU_CD: "KR7005930003" 같은 12자리 표준코드(ISIN)
    // - 일별매매정보의 ISU_CD: "005930" 같은 6자리 단축코드
    // 그래서 종목기본정보의 6자리 단축코드 필드인 ISU_SRT_CD로 연결해야 합니다.
    const tradeRow = tradeItems.find((item) => item.ISU_CD === matched.ISU_SRT_CD);

    if (!tradeRow) {
      res.status(404).json({ error: `"${keyword}"의 시세 정보를 찾을 수 없어요.` });
      return;
    }

    res.status(200).json({
      name: matched.ISU_NM,
      code: matched.ISU_SRT_CD,
      baseDate: tradeRow.BAS_DD,
      closePrice: tradeRow.TDD_CLSPRC,
      change: tradeRow.CMPPREVDD_PRC,
      changeRate: tradeRow.FLUC_RT,
    });
  } catch (error) {
    res.status(500).json({ error: "주가 정보를 불러오는 중 오류가 발생했습니다." });
  }
}
