# GuanDan Lab · 掼蛋实验室

> 快速会打，体面上桌。不是教你赢老板，是教你成为大家愿意再约的搭档。

[在线体验](https://guandan-bootcamp.miromind-0889.chatgpt.site) · [路线图](./ROADMAP.md) · [隐私说明](./PRIVACY.md) · [参与贡献](./CONTRIBUTING.md)

GuanDan Lab 是一个开源的零基础掼蛋训练器。它把确定性的竞技规则引擎、不会偷看牌的 AI 陪练、记牌训练和逐手复盘放在同一个 15 分钟学习路径里。默认场景是陪虚构角色“陈总”上桌：目标是节奏舒服、配合清楚、牌品可靠，而不是故意输牌或暗示牌情。

## 已经可以做什么

- 以 2022 年《竞技掼蛋竞赛规则（试行）》为基线实现教学规则；地区差异会明确标为变体，来源与已知差异见 [RULES_SOURCES.md](./RULES_SOURCES.md)。
- 使用两副 108 张唯一牌 ID 完成四人对局，规则引擎负责校验所有动作。
- 本地确定性 Agent 永远可用；配置兼容 OpenAI 的服务端接口后，可让大模型决策，返回动作仍会经过本地合法性校验。
- 配置 ElevenLabs 后使用中文语音教练；未配置或请求失败时回退到设备语音，字幕始终存在。
- 同点手牌叠放、可调 AI 节奏、最近出牌记录、一键合法提示。
- 九宫格记牌、完整事件回放、牌技分与社交分分离的赛后建议。
- 游客模式无需注册；浏览器始终保留最近训练记录，自托管配置 SQLite 后会同步完整事件与分析。

## 快速启动

需要 Node.js 22.13+：

```bash
git clone https://github.com/Mereithhh/guandan-lab.git
cd guandan-lab
cp .env.example .env.local
npm ci
npm run dev
```

打开 `http://localhost:3000`。所有第三方 AI/TTS 配置都是可选项，没有密钥也能完成完整本地训练。

Docker：

```bash
cp .env.example .env.local
# 在 .env.local 中设置至少 24 位随机 SESSION_SECRET
docker compose up --build
```

默认 SQLite 数据位于 Docker 命名卷的 `/data/guandan.sqlite`。数据库启用 WAL、外键与 busy timeout，并保存游客资料、会话、完整牌局、逐手事件、分析和用量配额表。未配置 `SESSION_SECRET` 时会安全降级为纯本机存档，不会签发可伪造的生产会话。

自托管数据接口支持 `GET /api/progress?export=1` 导出当前游客的数据，及 `DELETE /api/progress` 删除资料。写入和删除要求同源请求与 HttpOnly 签名会话。

可选 Google OAuth 使用 Authorization Code + PKCE。把 `${SITE_URL}/api/auth/google/callback` 注册为回调地址，再配置 `GOOGLE_CLIENT_ID` 与 `GOOGLE_CLIENT_SECRET`；登录后会在事务中把当前游客的历史认领到 Google 资料。项目只保存 Google subject、邮箱和显示名，不保存 Google access token。

## 可插拔 AI 与语音

所有密钥只由服务端读取，绝不能使用 `NEXT_PUBLIC_*`：

```dotenv
AI_BASE_URL=https://your-provider.example/v1
AI_API_KEY=replace-me
AI_MODEL=your-model
PAID_PROVIDERS_ENABLED=1

ELEVENLABS_API_KEY=replace-me
ELEVENLABS_VOICE_ID=replace-me
ELEVENLABS_MODEL_ID=eleven_multilingual_v2

# Optional: show a voluntary support QR code in the footer.
SUPPORT_URL=https://your-public-payment-link.example
```

`AI_BASE_URL` 默认必须是公网 HTTPS 地址，并固定请求 `/chat/completions`。只有在明确知道风险的本地自托管环境中，才能设置 `AI_ALLOW_PRIVATE_BASE_URL=1` 访问局域网模型。

当前匿名限流只适合单实例自托管试用。公开站点在 SQLite/平台级持久配额、日预算和熔断完成前，不应配置可产生费用的生产密钥。

## 验证

```bash
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
npm run test:e2e
```

规则域目前包含牌张守恒、非法动作、牌型、压牌、贡还牌、AI 不作弊观察和牌风分析测试。规则争议请使用专门的 Issue 模板，并附最小牌例、规则版本和出处。

## 架构边界

`lib/game` 是零 I/O 的确定性规则核心。当前公开 Demo 是单机训练模式，完整状态只存在浏览器，因此**不能**直接当作在线匹配服务。在线模式将采用服务端权威状态、座位投影、版本化事件日志与重连协议；详见 [架构说明](./docs/ARCHITECTURE.md)。

自托管长期路线是 Node BFF + SQLite 单实例；Cloudflare Sites 路线使用 D1 + Durable Objects。两者共享规则核心和网络协议，不共享存储实现。

## 项目路线

- `0.2`：开源基础、陈总训练场景、兼容 AI Provider、ElevenLabs TTS、Docker。
- `0.3`：5–7 张迷你残局、动态教练、真实事件记牌训练、角色化 Agent。
- `0.4`：游客云存档、SQLite、自助导出/删除与 Google OAuth 数据认领已进入自托管预览。
- `0.5`：服务端权威在线房间、匹配、断线重连、举报与安全机制。
- `1.0`：规则变体插件、Agent 锦标赛、稳定协议与可复用规则 SDK。

路线图不是已上线能力。完整状态和验收标准见 [ROADMAP.md](./ROADMAP.md)。

## 传播与伦理

- “投资人都爱掼蛋”不是产品承诺；我们只讨论有限信息、搭档协作与牌权管理这些可验证的训练价值。
- 不奖励喂牌、串通、偷看隐藏信息或故意输牌。
- “陈总”是虚构训练角色，不影射任何真实个人。
- 牌技有输赢，牌品没有捷径。

## 许可证

代码使用 [Apache License 2.0](./LICENSE)。AI 生成的原创品牌图片会在提交记录中标明；扑克花色字符属于通用符号。项目名称与视觉标识暂不作为兼容实现的背书。

欢迎提交规则牌例、地区变体资料、Agent 策略、无障碍改进和新手课程设计。请先阅读 [贡献指南](./CONTRIBUTING.md) 与 [安全策略](./SECURITY.md)。
