import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function GET() {
  // 最简形式：仅 finder + siteNumber + facetsList，limit 走顶层 URL 参数
  const url =
    `https://fa-evmr-saasfaprod1.fa.ocs.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
    `?onlyData=true` +
    `&finder=findReqs;siteNumber=CX_1` +
    `,facetsList=LOCATIONS%3BTITLES%3BCATEGORIES%3BORGANIZATIONS%3BPOSTING_DATES` +
    `&limit=5`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        status: res.status,
        body: (await res.text()).slice(0, 500),
      });
    }
    const json = await res.json();

    // 探测 items 的层级结构
    const probe: any = { topKeys: Object.keys(json) };
    if (Array.isArray(json.items)) {
      probe.itemsCount = json.items.length;
      const first = json.items[0] || {};
      probe.firstItemKeys = Object.keys(first);
      probe.totalJobsCount = first.TotalJobsCount;
      // 找带列表关键字的字段
      for (const k of Object.keys(first)) {
        if (Array.isArray(first[k]) && first[k].length > 0 && typeof first[k][0] === "object") {
          probe[`${k}_count`] = first[k].length;
          probe[`${k}_first_keys`] = Object.keys(first[k][0]).slice(0, 30);
          probe[`${k}_first_sample`] = first[k][0];
        }
      }
    }

    return NextResponse.json({ ok: true, probe });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) });
  }
}
