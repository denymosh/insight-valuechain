// Map: ticker symbol → ATS (applicant tracking system) config.

import type { OracleHcmConfig } from "./oracle_hcm";
import type { WorkdayConfig } from "./workday";
import type { GreenhouseConfig } from "./greenhouse";

export type AtsEntry =
  | { provider: "oracle_hcm"; config: OracleHcmConfig }
  | { provider: "workday";    config: WorkdayConfig }
  | { provider: "greenhouse"; config: GreenhouseConfig };

export const ATS_MAP: Record<string, AtsEntry> = {
  // Oracle HCM Recruiting Cloud
  NOK: {
    provider: "oracle_hcm",
    config: {
      host: "fa-evmr-saasfaprod1.fa.ocs.oraclecloud.com",
      siteNumber: "CX_1",
      publicDomain: "jobs.nokia.com",
    },
  },

  // Workday tenants
  MU: {
    provider: "workday",
    config: {
      tenant: "micron", pod: "wd1", site: "External",
      publicBase: "https://micron.wd1.myworkdayjobs.com/External",
    },
  },
  LITE: {
    provider: "workday",
    config: {
      tenant: "lumentum", pod: "wd5", site: "LITE",
      publicBase: "https://lumentum.wd5.myworkdayjobs.com/LITE",
    },
  },
  INTC: {
    provider: "workday",
    config: {
      tenant: "intel", pod: "wd1", site: "External",
      publicBase: "https://intel.wd1.myworkdayjobs.com/External",
    },
  },
  MRVL: {
    provider: "workday",
    config: {
      tenant: "marvell", pod: "wd1", site: "MarvellCareers",
      publicBase: "https://marvell.wd1.myworkdayjobs.com/MarvellCareers",
    },
  },
  BB: {
    provider: "workday",
    config: {
      tenant: "bb", pod: "wd3", site: "BlackBerry",
      publicBase: "https://bb.wd3.myworkdayjobs.com/BlackBerry",
    },
  },
  // QNX 是 BB 旗下的汽车软件业务（实时 OS），独立招聘门户。
  // 单独展示，因为 QNX 是 BB 真正的增长引擎（2.35 亿辆车在用）。
  QNX: {
    provider: "workday",
    config: {
      tenant: "bb", pod: "wd3", site: "QNX",
      publicBase: "https://bb.wd3.myworkdayjobs.com/QNX",
    },
  },

  // Greenhouse
  RKLB: {
    provider: "greenhouse",
    config: { boardToken: "rocketlab" },
  },

  // 后续可加：
  // ARM: iCIMS — 需要 token，暂不支持
  // SIMO: 自建站点 — 需要 HTML 抓取，暂不支持
};

export function getAtsForSymbol(symbol: string): AtsEntry | null {
  return ATS_MAP[symbol.toUpperCase()] ?? null;
}

export function getSupportedSymbols(): string[] {
  return Object.keys(ATS_MAP);
}
