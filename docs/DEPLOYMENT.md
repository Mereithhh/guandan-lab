# Production deployment

[English deployment guide](./DEPLOYMENT_EN.md)

GuanDan Lab 支持两种互斥的生产入口：托管 Sites Demo，或你自己的单机 Docker 服务。前者适合公开体验但当前无持久数据库；后者可以启用 SQLite、Google OAuth、付费 AI/TTS 和四人匹配。

## 方案 A：Sites 公开 Demo

当前生产地址是 `https://guandan-bootcamp.miromind-0889.chatgpt.site/`。要把 `guandan.mereith.com` 指向它，请在域名 DNS 控制台添加：

| 类型 | 名称 | 值 |
| --- | --- | --- |
| CNAME | `guandan` | `custom-domains.chatgpt.site.` |
| TXT | `_openai-site-verification.guandan` | `openai-site-verification=LpQXTq6rr1PeVwMmHpEyLpOGK7vVSKHS55QNp9awQAQ` |
| TXT | `_cf-custom-hostname.guandan` | `1ee5959b-7a27-457c-84ca-24f54938a9fe` |

Cloudflare DNS 用户应先把 CNAME 设为“仅 DNS”，待验证和证书状态变为 active 后再决定是否开启代理。不要同时给 `guandan` 设置 A/AAAA 和 CNAME。

## 方案 B：自己的 Docker 服务器

如果要启用云存档与真人匹配，删除上述 Sites CNAME，改为把 `guandan.mereith.com` 的 A/AAAA 记录指向服务器。服务器需安装 Docker Engine 与 Compose plugin。

```bash
git clone https://github.com/Mereithhh/guandan-lab.git
cd guandan-lab
cp .env.example .env.local
```

至少配置：

```dotenv
SITE_URL=https://guandan.mereith.com
DATABASE_PATH=/data/guandan.sqlite
SESSION_SECRET=使用密码管理器生成至少32字节随机值
ONLINE_MATCHING_ENABLED=1
TRUST_PROXY=1
```

保存配置后，直接用即将运行的 Docker 镜像做无密钥泄漏的静态体检；宿主机无需另装 Node.js：

```bash
docker compose build
docker compose run --rm --no-deps web node scripts/doctor.mjs
# 自动化平台可使用：在上一行末尾添加 --json
```

`doctor` 会把必需能力标为通过或失败，把尚未启用的可选能力标为提醒。报告不会输出环境变量值；只要存在 HTTPS、会话、SQLite、半套 OAuth/AI/TTS、非法 URL 或开关格式问题，就会返回非零退出码。它验证的是配置形状，不会向 Google、模型或 ElevenLabs 发起付费请求。

只有当反向代理会覆盖客户端传入的 `X-Forwarded-*` 头时才能启用 `TRUST_PROXY=1`。应用容器仅监听宿主机 `127.0.0.1:3000`，不要直接把 3000 端口暴露到公网。

启动并检查：

```bash
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3000/api/session
```

Compose 会把 `.env.local` 直接传给容器，不会用宿主机空变量覆盖其中的会话、OAuth、在线匹配、AI 或 TTS 配置。返回 JSON 中应包含 `"persistent":true`；还可检查 `googleOAuth`、`onlineMatching`、`agentProvider` 与 `voiceProvider`。该接口不会返回 Base URL、模型名或任何密钥。若 `persistent` 为 false，先检查 `SESSION_SECRET` 长度和 `/data` 命名卷权限。

## TLS 反向代理

Caddy 示例：

```caddyfile
guandan.mereith.com {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    -Server
  }
}
```

Caddy 会自动申请和续期证书。Nginx 用户应把 `Host`、`X-Forwarded-Host`、`X-Forwarded-Proto` 和真实客户端 IP 覆盖后转发，且只允许 HTTPS 访问应用。

## 可选服务

- Google OAuth 回调：`https://guandan.mereith.com/api/auth/google/callback`
- 兼容模型：`AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`、`PAID_PROVIDERS_ENABLED=1`
- ElevenLabs：`ELEVENLABS_API_KEY`、`ELEVENLABS_VOICE_ID`
- 自愿支持二维码：把公开收款或赞助页面填入 `SUPPORT_URL`

启用任一付费 Provider 时还必须设置 `PAID_PROVIDER_USER_DAILY_UNITS` 与 `PAID_PROVIDER_GLOBAL_DAILY_UNITS`；后者不得小于前者。可选成本、熔断与并发参数见 `.env.example`。单位是管理员定义的相对成本，不是货币或 Token 数。预算按 UTC 日在 SQLite 中持久化、原子扣减；删号不会返还全站预算，游客认领 Google 账户时会合并个人用量。

生产密钥只写入服务器 `.env.local`，不要提交到 Git。熔断和并发计数是单 Node 进程内状态；公开流量还应在反向代理增加连接级限流，并在 Provider 控制台设置独立硬预算与告警。

## 备份与升级

最稳妥的单机备份是在短暂停机后复制命名卷：

```bash
GUANDAN_CONTAINER="$(docker compose ps -q web)"
test -n "$GUANDAN_CONTAINER"
GUANDAN_VOLUME="$(docker inspect "$GUANDAN_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"
test -n "$GUANDAN_VOLUME"
docker compose stop web
mkdir -p backups
docker run --rm -v "$GUANDAN_VOLUME:/data:ro" -v "$PWD/backups:/backup" alpine \
  tar -czf /backup/guandan-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .
docker compose start web
```

首次执行前用 `docker volume ls` 确认实际卷名，不要猜测或覆盖已有备份。定期做恢复演练，并把备份加密复制到另一台机器。

升级流程：

```bash
git pull --ff-only
docker compose build --pull
docker compose up -d
docker compose ps
```

数据库迁移在启动时事务化执行；若磁盘中的 schema 比当前代码更新，服务会拒绝修改并停止。升级前仍必须备份。
