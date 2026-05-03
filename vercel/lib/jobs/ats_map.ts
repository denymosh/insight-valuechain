// Map: ticker symbol → ATS (applicant tracking system) config.

import type { OracleHcmConfig } from "./oracle_hcm";
import type { WorkdayConfig } from "./workday";
import type { GreenhouseConfig } from "./greenhouse";
import type { EightfoldConfig } from "./eightfold";
import type { LeverConfig } from "./lever";

export type AtsEntry =
  | { provider: "oracle_hcm";    config:  OracleHcmConfig }
  | { provider: "workday";       config:  WorkdayConfig }
  | { provider: "workday_multi"; configs: WorkdayConfig[] }   // 同一公司多个 ATS 站点合并
  | { provider: "greenhouse";    config:  GreenhouseConfig }
  | { provider: "eightfold";     config:  EightfoldConfig }
  | { provider: "lever";         config:  LeverConfig };

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
  // BB 用 multi-site：合并主公司站点 + QNX 子业务（汽车软件）。
  NVDA: {
    provider: "workday",
    config: {
      tenant: "nvidia", pod: "wd5", site: "NVIDIAExternalCareerSite",
      publicBase: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
    },
  },
  FORM: {
    provider: "workday",
    config: {
      tenant: "formfactor", pod: "wd1", site: "FFI-Careers",
      publicBase: "https://formfactor.wd1.myworkdayjobs.com/FFI-Careers",
    },
  },
  ONTO: {
    provider: "workday",
    config: {
      tenant: "onto", pod: "wd1", site: "ONTO_Careers",
      publicBase: "https://onto.wd1.myworkdayjobs.com/ONTO_Careers",
    },
  },
  CSCO: {
    provider: "workday",
    config: {
      tenant: "cisco", pod: "wd5", site: "Cisco_Careers",
      publicBase: "https://cisco.wd5.myworkdayjobs.com/Cisco_Careers",
    },
  },
  SMTC: {
    provider: "workday",
    config: {
      tenant: "semtech", pod: "wd1", site: "SemtechCareers",
      publicBase: "https://semtech.wd1.myworkdayjobs.com/SemtechCareers",
    },
  },
  PL: {
    provider: "greenhouse",
    config: { boardToken: "planetlabs" },
  },
  BB: {
    provider: "workday_multi",
    configs: [
      { tenant: "bb", pod: "wd3", site: "BlackBerry",
        publicBase: "https://bb.wd3.myworkdayjobs.com/BlackBerry" },
      { tenant: "bb", pod: "wd3", site: "QNX",
        publicBase: "https://bb.wd3.myworkdayjobs.com/QNX" },
    ],
  },

  // Greenhouse — RKLB 跟踪关键产品/项目招聘热度
  RKLB: {
    provider: "greenhouse",
    config: {
      boardToken: "rocketlab",
      // Neutron = 下一代中型火箭，Electron = 现役小火箭，
      // Archimedes = Neutron 用的引擎，Rutherford = Electron 引擎，
      // Photon = 卫星总线产品
      keywords: ["Neutron", "Electron", "Archimedes", "Rutherford", "Photon"],
    },
  },
  ALAB: {
    provider: "greenhouse",
    config: { boardToken: "asteralabs" },
  },
  ACHR: {
    provider: "greenhouse",
    config: { boardToken: "archer56" },
  },

  // ── 半导体大厂 ──
  AVGO: {
    provider: "workday",
    config: {
      tenant: "broadcom", pod: "wd1", site: "External_Career",
      publicBase: "https://broadcom.wd1.myworkdayjobs.com/External_Career",
    },
  },
  ADI: {
    provider: "workday",
    config: {
      tenant: "analogdevices", pod: "wd1", site: "External",
      publicBase: "https://analogdevices.wd1.myworkdayjobs.com/External",
    },
  },
  MCHP: {
    provider: "workday",
    config: {
      tenant: "microchiphr", pod: "wd5", site: "External",
      publicBase: "https://microchiphr.wd5.myworkdayjobs.com/External",
    },
  },
  GFS: {
    provider: "workday",
    config: {
      tenant: "globalfoundries", pod: "wd1", site: "External",
      publicBase: "https://globalfoundries.wd1.myworkdayjobs.com/External",
    },
  },
  CIEN: {
    provider: "workday",
    config: {
      tenant: "ciena", pod: "wd5", site: "Careers",
      publicBase: "https://ciena.wd5.myworkdayjobs.com/Careers",
    },
  },
  VIAV: {
    provider: "workday",
    config: {
      tenant: "viavisolutions", pod: "wd1", site: "careers",
      publicBase: "https://viavisolutions.wd1.myworkdayjobs.com/careers",
    },
  },

  // ── 防务/航天 ──
  NOC: {
    provider: "workday",
    config: {
      tenant: "ngc", pod: "wd1", site: "Northrop_Grumman_External_Site",
      publicBase: "https://ngc.wd1.myworkdayjobs.com/Northrop_Grumman_External_Site",
    },
  },
  AVAV: {
    provider: "workday",
    config: {
      tenant: "avav", pod: "wd1", site: "AVAV",
      publicBase: "https://avav.wd1.myworkdayjobs.com/AVAV",
    },
  },
  TDY: {
    provider: "workday",
    config: {
      // Teledyne 用 FLIR 收购后的 Workday tenant
      tenant: "flir", pod: "wd1", site: "flircareers",
      publicBase: "https://flir.wd1.myworkdayjobs.com/flircareers",
    },
  },

  // ── 大科技 / 数据中心 ──
  DELL: {
    provider: "workday",
    config: {
      tenant: "dell", pod: "wd1", site: "External",
      publicBase: "https://dell.wd1.myworkdayjobs.com/External",
    },
  },

  // ── 能源 / 工业 ──
  BE: {
    provider: "workday",
    config: {
      tenant: "bloomenergy", pod: "wd1", site: "BloomEnergyCareers",
      publicBase: "https://bloomenergy.wd1.myworkdayjobs.com/BloomEnergyCareers",
    },
  },
  GEV: {
    provider: "workday",
    config: {
      tenant: "gevernova", pod: "wd5", site: "Vernova_ExternalSite",
      publicBase: "https://gevernova.wd5.myworkdayjobs.com/Vernova_ExternalSite",
    },
  },
  TLN: {
    provider: "workday",
    config: {
      tenant: "talenenergy", pod: "wd1", site: "TalenCareers",
      publicBase: "https://talenenergy.wd1.myworkdayjobs.com/TalenCareers",
    },
  },
  APD: {
    provider: "workday",
    config: {
      tenant: "airproducts", pod: "wd5", site: "AP0001",
      publicBase: "https://airproducts.wd5.myworkdayjobs.com/AP0001",
    },
  },

  // ── 材料/特殊金属 ──
  HXL: {
    provider: "workday",
    config: {
      tenant: "hexcel", pod: "wd5", site: "HexcelCareers",
      publicBase: "https://hexcel.wd5.myworkdayjobs.com/HexcelCareers",
    },
  },
  MTRN: {
    provider: "workday",
    config: {
      tenant: "materion", pod: "wd5", site: "Materion",
      publicBase: "https://materion.wd5.myworkdayjobs.com/Materion",
    },
  },

  // ── 制造服务 ──
  JBL: {
    provider: "workday",
    config: {
      tenant: "jabil", pod: "wd5", site: "Jabil_Careers",
      publicBase: "https://jabil.wd5.myworkdayjobs.com/Jabil_Careers",
    },
  },
  TTMI: {
    provider: "workday",
    config: {
      tenant: "ttmtech", pod: "wd5", site: "jobs",
      publicBase: "https://ttmtech.wd5.myworkdayjobs.com/jobs",
    },
  },

  // ── Eightfold AI ──
  STM: {
    provider: "eightfold",
    config: { tenant: "stmicroelectronics", domain: "stmicroelectronics.com" },
  },

  // ── Oracle HCM (custom path prefix when no own domain) ──
  // Coherent — hcwp.fa.us2.oraclecloud.com 对外通过 hcmUI/CandidateExperience 暴露
  COHR: {
    provider: "oracle_hcm",
    config: {
      host: "hcwp.fa.us2.oraclecloud.com",
      siteNumber: "CX_1",
      // publicDomain 包含完整路径前缀，让 careers_url + job links 拼接正确
      publicDomain: "hcwp.fa.us2.oraclecloud.com/hcmUI/CandidateExperience",
    },
  },

  // ── Lever ──
  PLTR: {
    provider: "lever",
    config: { company: "palantir" },
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
