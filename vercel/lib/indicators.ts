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
  }
  return out;
}
