const fs = require("fs");

const START_YEAR = 2026;
const END_YEAR = new Date().getFullYear() + 3;

const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY;

if (!serviceKey) {
  console.error("DATA_GO_KR_SERVICE_KEY가 없습니다.");
  process.exit(1);
}

function pad(num) {
  return String(num).padStart(2, "0");
}

async function fetchMonth(year, month) {
  const url =
    "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo" +
    `?ServiceKey=${serviceKey}` +
    `&solYear=${year}` +
    `&solMonth=${pad(month)}` +
    `&_type=json` +
    `&numOfRows=100`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`API 호출 실패: ${res.status}`);
  }

  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    console.error("JSON 파싱 실패. API 응답 원문:");
    console.error(text);
    throw error;
  }

  const resultCode = data?.response?.header?.resultCode;
  const resultMsg = data?.response?.header?.resultMsg;

  if (resultCode && resultCode !== "00") {
    throw new Error(`공공데이터 API 오류: ${resultCode} / ${resultMsg}`);
  }

  const items = data?.response?.body?.items?.item;

  if (!items) {
    return [];
  }

  return Array.isArray(items) ? items : [items];
}

async function fetchYear(year) {
  const holidays = {};

  for (let month = 1; month <= 12; month++) {
    console.log(`${year}년 ${month}월 공휴일 조회 중...`);

    const items = await fetchMonth(year, month);

    for (const item of items) {
      const locdate = String(item.locdate);
      const dateName = item.dateName;
      const isHoliday = item.isHoliday;

      if (isHoliday === "Y") {
        const yyyy = locdate.slice(0, 4);
        const mm = locdate.slice(4, 6);
        const dd = locdate.slice(6, 8);
        const key = `${yyyy}-${mm}-${dd}`;

        holidays[key] = dateName;
      }
    }
  }

  fs.writeFileSync(
    `holidays-${year}.json`,
    JSON.stringify(holidays, null, 2),
    "utf-8"
  );

  console.log(`holidays-${year}.json 생성 완료`);
}

async function main() {
  for (let year = START_YEAR; year <= END_YEAR; year++) {
    await fetchYear(year);
  }

  console.log(`${START_YEAR}년부터 ${END_YEAR}년까지 공휴일 파일 생성 완료`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
