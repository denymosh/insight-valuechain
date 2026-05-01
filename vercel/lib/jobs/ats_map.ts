// Map: ticker symbol → ATS (applicant tracking system) config
// Add new entries here as we expand coverage.

import type { OracleHcmConfig } from "./oracle_hcm";

export type AtsEntry =
  | { provider: "oracle_hcm"; config: OracleHcmConfig };
// Future: | { provider: "workday"; config: ... };
//         | { provider: "greenhouse"; config: ... };

export const ATS_MAP: Record<string, AtsEntry> = {
  NOK: {
    provider: "oracle_hcm",
    config: {
      host: "fa-evmr-saasfaprod1.fa.ocs.oraclecloud.com",
      siteNumber: "CX_1",
      publicDomain: "jobs.nokia.com",
    },
  },
  // 后续逐步添加：
  // CSCO: { provider: "oracle_hcm", config: { host: "...", siteNumber: "...", publicDomain: "jobs.cisco.com" } },
  // INTC: { provider: "workday", config: { ... } },
  // AMD:  { provider: "workday", config: { ... } },
};

export function getAtsForSymbol(symbol: string): AtsEntry | null {
  return ATS_MAP[symbol.toUpperCase()] ?? null;
}

export function getSupportedSymbols(): string[] {
  return Object.keys(ATS_MAP);
}
