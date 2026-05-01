# Insight ValueChain — Vercel 云端版

100% TypeScript / Next.js + Supabase + Vercel Cron。所有数据来自 yfinance（约 15 分钟延迟）。
不依赖 IBKR / TWS，可永久在线，电脑可关机。

## 部署步骤（约 20 分钟）

### 1. 创建 Supabase 项目（免费）

1. 访问 https://supabase.com → New project
2. 起个名字（例：`insight-valuechain`），选最近的 region，设个数据库密码（保存好）
3. 项目创建好后，左侧 SQL Editor → New query → 把 [`supabase/schema.sql`](./supabase/schema.sql) 全文粘进去 → Run
4. Project Settings → API → 复制两个值：
   - **Project URL**（形如 `https://xxx.supabase.co`）
   - **service_role key**（**不是** anon key！这是给后端用的，权限大，不要暴露到前端）

### 2. 部署到 Vercel

1. 把 `vercel/` 这个文件夹推到一个 GitHub 仓库（或者把整个项目推上去，但部署时 Root Directory 选 `vercel`）
2. 访问 https://vercel.com → New Project → 选这个仓库
3. **Root Directory** 改成 `vercel`（如果 vercel/ 是子目录的话）
4. **Environment Variables** 加 3 个：
   - `SUPABASE_URL` = 刚刚的 Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key
   - `CRON_SECRET` = 随便一个长字符串，例如 `openssl rand -hex 32` 的输出
5. Deploy

部署成功后你会拿到一个 `https://your-app.vercel.app` 地址。

### 3. 配置 5 分钟价格刷新（外部 cron）

Vercel 免费版（Hobby）的 cron job **每天最多跑 1 次**，所以 5 分钟一次的价格刷新需要外部触发器。

**方案：cron-job.org（推荐，免费）**

1. 访问 https://cron-job.org → 注册（免费）
2. 新建 cronjob：
   - Title: `IVC Refresh Prices`
   - URL: `https://your-app.vercel.app/api/cron/refresh-prices?key=YOUR_CRON_SECRET`
     （把 `YOUR_CRON_SECRET` 替换成你设的那个）
   - Schedule: Every 5 minutes
   - Save

也可以选 **Cloudflare Workers Cron Triggers** / **GitHub Actions**（最低 5 分钟），任选一种。

### 4. 等第一批数据

部署后立即:
- 访问首页：sectors / categories / tickers 都是空的
- 通过 UI 创建一级赛道 → 二级分类 → 添加标的
- 标的添加时会自动 fire-and-forget 触发一次 `refreshDailyOne` + `refreshPriceOne`，几秒后第一组数据进来
- 5 分钟内外部 cron 第一次触发，所有标的的价格 + 走势图刷新一次
- 美东时间凌晨 21:30 UTC（约 17:30 ET，美股收盘后），Vercel cron 触发每日刷新（指标 / 基本面 / 财报）

## 本地开发

```bash
cd vercel
cp .env.example .env.local   # 填入你的 Supabase 凭据
npm install
npm run dev
# 浏览器打开 http://localhost:3737
```

## 触发刷新（手动测试）

```bash
# 单标的刷新
curl -X POST https://your-app.vercel.app/api/refresh_indicators/NVDA

# 价格批量刷新（需要 CRON_SECRET）
curl "https://your-app.vercel.app/api/cron/refresh-prices?key=YOUR_CRON_SECRET"

# 每日刷新
curl "https://your-app.vercel.app/api/cron/refresh-daily?key=YOUR_CRON_SECRET"
```

## 与本地 TWS 版的功能差异

| 功能 | 本地 TWS 版 | Vercel 版 |
|------|------------|-----------|
| 数据源 | IBKR 实时 + yfinance | 只有 yfinance（~15min 延迟）|
| 实时性 | WebSocket 秒级推送 | 30 秒前端轮询 |
| 添加 / 编辑 / 删除赛道、分类、标的 | ✅ | ✅ |
| 详情面板（moat / risk / notes 富文本编辑）| ✅ | ✅ |
| 拖拽排序 | ✅ | ✅ |
| 走势缩略图 | ✅ | ✅ |
| 财报日期徽章 | ✅ | ✅ |
| 数据源切换 / TWS 状态 / WS<2 实时 | ✅ | ❌（云端无 IBKR）|
| 永远在线（电脑可关）| ❌ | ✅ |

## 常见问题

**Q：Supabase 免费层够用吗？**
500 MB 数据库 + 5 GB 带宽 + 50k 月活，对个人 watchlist 绰绰有余。100 个标的全量数据约 < 5 MB。

**Q：Vercel 免费层够用吗？**
Hobby 100 GB 带宽 + 100k function 调用 / 月。轮询 30s × 单用户 ≈ 86k/月，正好。如果多人同时用，可能要升 Pro。

**Q：cron-job.org 不稳定怎么办？**
换 GitHub Actions（每 5 分钟）或 Cloudflare Workers Cron（每分钟）。三者都免费。

**Q：怎么从本地版迁移数据？**
本地的 `data.db`（SQLite）里有 sectors / categories / tickers 表，可以导出成 CSV 然后从 Supabase 后台导入。或者写个一次性迁移脚本（要的话告诉我）。
