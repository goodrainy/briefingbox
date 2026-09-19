export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    res.status(400).json({ error: "url이 필요합니다." });
    return;
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NewsBiteThumbnailBot/1.0)",
      },
    });

    if (!response.ok) {
      throw new Error(`페이지 요청 실패 (status ${response.status})`);
    }

    const html = await response.text();

    const ogMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

    if (!ogMatch) {
      res.status(404).json({ error: "이미지를 찾을 수 없어요." });
      return;
    }

    res.status(200).json({ image: ogMatch[1] });
  } catch (error) {
    res.status(500).json({ error: "이미지를 불러오는 중 오류가 발생했습니다." });
  }
}
