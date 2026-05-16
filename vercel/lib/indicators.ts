// Port of backend/app/indicators.py — pure-TS implementations of EMA, RSI,
// MACD, return-period helpers and the compute_snapshot aggregator.

export type Bar = { date: Date; open: number; high: number; low: number; close: number; volume: number };

export function ema(values: number[], length: number): number[] {
  const k = 2 / (length + 1);
  const out: number[] = [];
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** Simple Moving Average. For first (length-1) values, returns partial average so far. */
export function sma(values: number[], length: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= length) sum -= values[i - length];
    out.push(i >= length - 1 ? sum / length : sum / (i + 1));
  }
  return out;
}

export function rsi(values: number[], length: number): number[] {
  if (values.length < 2) return values.map(() => 50);
  const alpha = 1 / length;
  const gains: number[] = [0];
  const losses: number[] = [0];
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }
  // EWMA with alpha = 1/length
  let avgG = gains[1] ?? 0;
  let avgL = losses[1] ?? 0;
  const out: number[] = [50, 50];
  for (let i = 2; i < values.length; i++) {
    avgG = gains[i] * alpha + avgG * (1 - alpha);
    avgL = losses[i] * alpha + avgL * (1 - alpha);
    if (avgL === 0) {
      out.push(100);
    } else {
      const rs = avgG / avgL;
      out.push(100 - 100 / (1 + rs));
    }
  }
  while (out.length < values.length) out.unshift(50);
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9): { dif: number[]; dea: number[] } {
  const ef = ema(values, fast);
  const es = ema(values, slow);
  const dif = ef.map((v, i) => v - es[i]);
  const dea = ema(dif, signal);
  return { dif, dea };
}

function ytdReturn(daily: Bar[]): number | null {
  if (!daily.length) return null;
  const last = daily[daily.length - 1];
  const year = last.date.getUTCFullYear();
  const inYear = daily.filter((b) => b.date.getUTCFullYear() === year);
  if (!inYear.length) return null;
  const base = inYear[0].close;
  if (base === 0) return null;
  return ((last.close - base) / base) * 100;
}

export type Snapshot = Partial<{
  session_close: number;
  prev_close: number;
  return_5d: number;
  return_20d: number;
  return_ytd: number | null;
  high_52w: number;
  ema50: number;
  ema200: number | null;
  rsi6: number;
  rsi14: number;
  rsi_d: number;
  ema20_d: number;
  d_state: boolean;
  rsi_w: number;
  ema10_w: number;
  ema20_w: number;
  macd_w: number;
  signal_w: number;
  w_state: boolean;
  rsi_m: number;
  ema10_m: number;
  ema20_m: number;
  m_state: boolean;
  /** 过去 6 个月月度收益率的算术平均（%）—— simple 6-month momentum */
  mom_6m_avg: number;
  /** 过去 6 个月累积收益（%）—— used for relative momentum calc */
  return_6m: number;
  /** 12M-1 动量（%）：从 13 个月前到 1 个月前的累积收益（学术标准 Jegadeesh-Titman） */
  mom_12m1: number;
  // ── 趋势信号系统（9-EMA / 21-EMA / 50-SMA / 200-SMA 多时间维度对齐）──
  ema9_d: number;
  ema21_d: number;
  sma50_d: number;
  sma200_d: number;
  /** "bull" = 9>21 EMA & 价>50/200 SMA, "hold" = 价仅守住 200 SMA, "bear" = 全部跌破 */
  trend_signal: "bull" | "hold" | "bear" | "mixed";
}>;

export function computeSnapshot(daily: Bar[], weekly: Bar[], monthly: Bar[]): Snapshot {
  const out: Snapshot = {};
  if (daily.length) {
    const c = daily.map((b) => b.close);
    const last = c[c.length - 1];
    out.session_close = last;
    out.prev_close = c.length >= 2 ? c[c.length - 2] : last;
    if (c.length >= 6) out.return_5d = ((last - c[c.length - 6]) / c[c.length - 6]) * 100;
    if (c.length >= 21) out.return_20d = ((last - c[c.length - 21]) / c[c.length - 21]) * 100;
    out.return_ytd = ytdReturn(daily);
    // 52-week high using daily HIGH (or close) over last 252 bars
    const recent = daily.slice(-252);
    const hi = Math.max(
      ...recent.map((b) => b.high ?? -Infinity),
      ...recent.map((b) => b.close)
    );
    out.high_52w = hi;
    out.ema50 = ema(c, 50)[c.length - 1];
    out.ema200 = c.length >= 200 ? ema(c, 200)[c.length - 1] : null;

    // ── 趋势信号系统 ──
    // 短期动量用 EMA（响应快），中长期支撑用 SMA（华尔街共识）
    if (c.length >= 21) {
      const e9  = ema(c, 9)[c.length - 1];
      const e21 = ema(c, 21)[c.length - 1];
      out.ema9_d  = e9;
      out.ema21_d = e21;
      const sma50  = c.length >= 50  ? sma(c, 50)[c.length - 1]  : null;
      const sma200 = c.length >= 200 ? sma(c, 200)[c.length - 1] : null;
      if (sma50  != null) out.sma50_d  = sma50;
      if (sma200 != null) out.sma200_d = sma200;

      // 四个条件
      const cond9over21 = e9 > e21;
      const condAbove50 = sma50  != null ? last > sma50  : null;
      const condAbove200 = sma200 != null ? last > sma200 : null;

      // 判定逻辑
      if (cond9over21 && condAbove50 === true && condAbove200 === true) {
        out.trend_signal = "bull";
      } else if (condAbove200 === true && (cond9over21 === false || condAbove50 === false)) {
        // 长期趋势仍在（>200SMA）但短/中期已弱
        out.trend_signal = "hold";
      } else if (!cond9over21 && condAbove50 === false && condAbove200 === false) {
        out.trend_signal = "bear";
      } else if (condAbove200 === false) {
        // 跌破 200SMA 但短/中期还在 → 关注（可能熊市反弹）
        out.trend_signal = "mixed";
      } else {
        out.trend_signal = "mixed";
      }
    }

    out.rsi6 = rsi(c, 6)[c.length - 1];
    out.rsi14 = rsi(c, 14)[c.length - 1];
    out.rsi_d = out.rsi14;
    const ema20d = ema(c, 20)[c.length - 1];
    out.ema20_d = ema20d;
    out.d_state = last > ema20d && out.rsi14! >= 40 && out.rsi14! <= 80;
  }
  if (weekly.length) {
    const wc = weekly.map((b) => b.close);
    out.rsi_w = rsi(wc, 14)[wc.length - 1];
    if (wc.length >= 26) {
      const e10 = ema(wc, 10)[wc.length - 1];
      const e20 = ema(wc, 20)[wc.length - 1];
      const { dif, dea } = macd(wc);
      out.ema10_w = e10;
      out.ema20_w = e20;
      out.macd_w = dif[dif.length - 1];
      out.signal_w = dea[dea.length - 1];
      const lastW = wc[wc.length - 1];
      out.w_state = lastW > e10 && e10 > e20 && out.macd_w > out.signal_w;
    }
  }
  if (monthly.length) {
    const mc = monthly.map((b) => b.close);
    out.rsi_m = rsi(mc, 14)[mc.length - 1];
    if (mc.length >= 20) {
      const e10 = ema(mc, 10)[mc.length - 1];
      const e20 = ema(mc, 20)[mc.length - 1];
      out.ema10_m = e10;
      out.ema20_m = e20;
      out.m_state = mc[mc.length - 1] > e10 && e10 > e20;
    }
    // 6-month average momentum: arithmetic mean of last 6 monthly returns (%).
    // Need 7 closes to compute 6 monthly returns.
    if (mc.length >= 7) {
      const last7 = mc.slice(-7);
      let sum = 0;
      let n = 0;
      for (let i = 1; i < last7.length; i++) {
        const prev = last7[i - 1];
        if (prev > 0) {
          sum += ((last7[i] - prev) / prev) * 100;
          n++;
        }
      }
      if (n > 0) out.mom_6m_avg = sum / n;

      // 6-month cumulative return: (close_now - close_6m_ago) / close_6m_ago
      const c0 = mc[mc.length - 7];
      const cN = mc[mc.length - 1];
      if (c0 > 0) out.return_6m = ((cN - c0) / c0) * 100;
    }

    // 12M-1 momentum (Jegadeesh-Titman): cumulative return from 13 months ago to 1 month ago.
    // Skips the most recent month to avoid short-term reversal effect.
    if (mc.length >= 14) {
      const start = mc[mc.length - 14]; // 13 months ago
      const end   = mc[mc.length - 2];  // 1 month ago
      if (start > 0) out.mom_12m1 = ((end - start) / start) * 100;
    }
  }
  return out;
}
