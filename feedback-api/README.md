# Black Mamba 作者反馈 API

Cloudflare Worker `kobify-feedback` + D1 数据库 `kobify-feedback`。前端位于 GitHub Pages 的 `/kobify/` 页面，页脚“向作者反馈”打开表单。反馈不公开展示，无公共查询接口。

## 作者查看反馈

在 Cloudflare 控制台打开 D1 → `kobify-feedback` → “探索数据”，选择 `feedback` 表。也可在“控制台”执行：

```sql
SELECT id, datetime(created_at,'unixepoch') AS created_utc,
       category, message, contact, page
FROM feedback ORDER BY created_at DESC LIMIT 100;
```

`created_at` 为 UTC Unix 秒；`category` 为 bug/suggestion/other。联系方式可选。不会上传图片、像素或还原密钥。`visitor_hash` 是每日变化的 IP SHA-256 摘要，用于限流，不保存原始 IP；摘要并不等于匿名化。反馈仅登录 Cloudflare 的账户作者可读。

## 接口

`POST /feedback`，仅接受 `Origin: https://silicastra.github.io` 的 JSON 请求。字段为 UUIDv4 `id`、`category`、5～2000 字符 `message`、最长120字符 `contact`、`page: home/result`、空蜜罐字段 `website`。`GET /health` 只返回服务状态；不会暴露数据库内容。

数据库使用参数化 SQL；限制8KiB请求、每个每日网络摘要10分钟5条、全站每天200条。SQL插入与计数限制在同一条语句完成。UUID确保网络超时后重试不会重复插入。来源限制不是用户认证，限流与全站上限降低匿名接口被滥用的影响。

## 部署与测试

`wrangler.jsonc` 只含资源标识，没有凭据。Worker 的 D1 变量名为 `DB`。

```sh
node tests.mjs
npx wrangler deploy --dry-run
# 首次建表（已通过控制台执行，不会删除数据）
npx wrangler d1 execute kobify-feedback --remote --file=schema.sql
npx wrangler deploy
```

测试使用真正的内存 SQLite，覆盖保存、幂等重试、参数注入、错误输入、来源限制、大小限制、蜜罐、单访客与全站日限额和数据库不可用。

当前账户为免费计划；不启用付费资源或自动升级。Workers/D1自身免费配额仍适用；达到限额时服务返回错误，前端保留内容供稍后重试。
