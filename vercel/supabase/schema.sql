-- Insight ValueChain — Supabase Postgres schema
-- Run this once in Supabase SQL editor (project → SQL → new query → paste → run).

create table if not exists sectors (
  id          bigserial primary key,
  name        text not null,
  sort_order  int not null default 0,
  description text not null default '',
  created_at  timestamptz not null default now()
);
create unique index if not exists sectors_name_uniq on sectors(name);

create table if not exists categories (
  id          bigserial primary key,
  sector_id   bigint not null references sectors(id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  description text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists categories_sector_idx on categories(sector_id);

create table if not exists tickers (
  id              bigserial primary key,
  symbol          text not null,
  exchange        text not null default 'SMART',
  currency        text not null default 'USD',
  sec_type        text not null default 'STK',
  category_id     bigint references categories(id) on delete set null,
  sort_order      int not null default 0,
  display_name    text not null default '',
  industry        text not null default '',
  moat            text not null default '',
  risk            text not null default '',
  notes           text not null default '',
  tags            text not null default '',
  position_status text not null default 'watch',
  sa_rating       text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists tickers_symbol_idx on tickers(symbol);
create index if not exists tickers_category_idx on tickers(category_id);
-- prevent duplicate symbol within same category (NULL category_id allowed multiple times by default)
create unique index if not exists tickers_symbol_category_uniq
  on tickers(symbol, category_id) where category_id is not null;

-- One row per symbol holding the latest snapshot of yfinance-derived data.
-- All numeric/text fields are nullable because some symbols may not have all data.
create table if not exists quotes (
  symbol           text primary key,
  source           text not null default 'yfinance',
  last             double precision,
  prev_close       double precision,
  change           double precision,
  change_pct       double precision,
  return_5d        double precision,
  return_20d       double precision,
  return_ytd       double precision,
  market_cap       double precision,
  pe_ttm           double precision,
  pe_fwd           double precision,
  ps_ttm           double precision,
  growth_yoy       double precision,
  growth_fwd       double precision,
  gross_margin     double precision,
  ebitda_margin    double precision,
  ws_rating        double precision,
  ws_rating_label  text,
  target_price     double precision,
  high_52w         double precision,
  ema50            double precision,
  ema200           double precision,
  rsi6             double precision,
  rsi14            double precision,
  rsi_d            double precision,
  rsi_w            double precision,
  rsi_m            double precision,
  m_state          boolean,
  w_state          boolean,
  d_state          boolean,
  ema10_m          double precision,
  ema20_m          double precision,
  ema10_w          double precision,
  ema20_w          double precision,
  ema20_d          double precision,
  macd_w           double precision,
  signal_w         double precision,
  intraday_15m     jsonb,    -- list of {t,c,s}
  next_earnings    jsonb,    -- {date, time, days}
  updated_at       timestamptz not null default now()
);
