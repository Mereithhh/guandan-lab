# Production deployment

[中文部署指南](./DEPLOYMENT.md)

GuanDan Lab supports two mutually exclusive production paths: the hosted Sites demo, or your own single-node Docker service. The hosted path is convenient for a public demo but currently has no persistent database. Self-hosting can enable SQLite persistence, Google OAuth, paid AI/TTS providers and four-player matching.

## Option A: hosted Sites demo

The current production URL is `https://guandan-bootcamp.miromind-0889.chatgpt.site/`. To point `guandan.mereith.com` to it, add these records in your DNS console:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `guandan` | `custom-domains.chatgpt.site.` |
| TXT | `_openai-site-verification.guandan` | `openai-site-verification=LpQXTq6rr1PeVwMmHpEyLpOGK7vVSKHS55QNp9awQAQ` |
| TXT | `_cf-custom-hostname.guandan` | `1ee5959b-7a27-457c-84ca-24f54938a9fe` |

Cloudflare DNS users should keep the CNAME in **DNS only** mode until domain verification and certificate status are active. Do not create A/AAAA records and a CNAME for `guandan` at the same time.

## Option B: your own Docker server

To enable persistent progress and live matching, remove the Sites CNAME above and point the A/AAAA records for `guandan.mereith.com` to your server. The server needs Docker Engine and the Compose plugin.

```bash
git clone https://github.com/Mereithhh/guandan-lab.git
cd guandan-lab
cp .env.example .env.local
```

Configure at least:

```dotenv
SITE_URL=https://guandan.mereith.com
DATABASE_PATH=/data/guandan.sqlite
SESSION_SECRET=generate-at-least-32-random-bytes-with-a-password-manager
ONLINE_MATCHING_ENABLED=1
TRUST_PROXY=1
```

Only enable `TRUST_PROXY=1` when your reverse proxy overwrites incoming client-supplied `X-Forwarded-*` headers. The application container binds only to `127.0.0.1:3000` on the host; do not expose port 3000 directly to the internet.

Start and inspect the service:

```bash
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3000/api/session
```

Compose passes `.env.local` directly to the container and does not replace its session, OAuth, matching, AI or TTS settings with empty host values. The response should include `"persistent":true`. You can also inspect `googleOAuth`, `onlineMatching`, `agentProvider` and `voiceProvider`; this endpoint never returns provider base URLs, model names or secrets. If `persistent` is false, check the `SESSION_SECRET` length and permissions on the `/data` named volume.

## TLS reverse proxy

Caddy example:

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

Caddy obtains and renews certificates automatically. With Nginx, overwrite and forward `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto` and the real client IP, and allow access to the application only through HTTPS.

## Optional services

- Google OAuth callback: `https://guandan.mereith.com/api/auth/google/callback`
- Compatible model provider: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `PAID_PROVIDERS_ENABLED=1`
- ElevenLabs: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`
- Voluntary support QR: set `SUPPORT_URL` to a public sponsorship or payment page

Keep production secrets only in the server's `.env.local`; never commit them. Before enabling paid providers for anonymous public traffic, add connection-level rate limiting and daily budget alerts at the reverse proxy or provider layer.

## Backup and upgrade

For a consistent single-node backup, briefly stop the web service and copy the named volume:

```bash
docker compose stop web
docker run --rm -v guandan_guandan-data:/data -v "$PWD/backups:/backup" alpine \
  tar -czf /backup/guandan-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .
docker compose start web
```

Before the first backup, run `docker volume ls` and verify the actual volume name. Do not guess the name or overwrite an existing backup. Test restoration regularly and keep an encrypted copy on another machine.

Upgrade with:

```bash
git pull --ff-only
docker compose build --pull
docker compose up -d
docker compose ps
```

Database migrations run transactionally at startup. If the on-disk schema is newer than the running code, the service refuses to modify it and stops. Always back up before upgrading.
