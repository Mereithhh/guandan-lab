# GuanDan Lab Launch Kit

这份材料用于开源首发、社区介绍和媒体沟通。任何传播都应指向真实已发布能力；自托管 Beta 与公开 Demo 必须明确区分。

## 一句话定位

GuanDan Lab（掼蛋实验室）是一个开源的零基础掼蛋训练器：用确定性规则引擎、不偷看牌的 AI 陪练、语音教练、记牌训练和逐手复盘，让第一次上桌的人快速会打，也成为大家愿意再约的搭档。

主 slogan：**快速会打，体面上桌。**

辅助文案：

- 不是教你赢老板，是教你成为大家愿意再约的搭档。
- AI 不偷看牌，复盘不靠玄学。
- 向上社交的底牌，是别让全桌等你。
- 牌技有输赢，牌品没有捷径。

## 30 秒介绍

很多人第一次接触掼蛋，不是为了比赛，而是突然被叫上桌。传统规则文章很长，普通游戏又不会解释为什么。GuanDan Lab 先提供标称 15 分钟的核心规则课程，之后再进入合法提示、三位 AI 牌友、九宫格记牌和证据化复盘。默认角色“陈总”完全虚构；系统训练节奏、搭档意识与牌桌礼仪，不奖励故意输牌、暗号或偷看隐藏信息。

## 可直接发布的中文首发帖

> 做了一个开源的「掼蛋实验室」：给今晚突然要陪陈总上桌、但连顺子和钢板都分不清的人。
>
> 15 分钟认识规则，3 位 AI 牌友陪练；AI 看不到别人的牌，每个动作还要经过本地规则引擎。你可以调慢 AI 节奏、展开最近出牌、用九宫格练记牌，打完会得到牌技分和社交分两份复盘。
>
> 快速会打，体面上桌。不是教你赢老板，是教你成为大家愿意再约的搭档。

推荐附上在线体验、GitHub 仓库和 `public/walkthrough.gif`；需要纯视觉头图时使用 `public/launch-poster.png`。

## English launch copy

**GuanDan Lab is an open-source, beginner-first coach for Guandan, a widely played Chinese partnership card game.** It combines a deterministic rules engine, fair-play AI partners, optional voice coaching, memory drills, and evidence-based replays. The goal is not to script a win—it is to help a newcomer play confidently, cooperate clearly, and keep the table enjoyable.

Tagline: **Learn fast. Play with grace.**

Canonical links:

- Try the public local-mode demo: https://guandan-bootcamp.miromind-0889.chatgpt.site
- View or star the source: https://github.com/Mereithhh/guandan-lab
- Self-hosting guide: https://github.com/Mereithhh/guandan-lab/blob/main/docs/DEPLOYMENT_EN.md

The public demo uses the deterministic local Agent and device voice. Compatible paid models, ElevenLabs, SQLite cloud saves, Google OAuth and live matchmaking are opt-in self-hosted Beta capabilities.

Short post:

> I built GuanDan Lab, an open-source beginner coach for the Chinese four-player partnership game Guan Dan. Learn the core decisions in a 15-minute crash-course format, then practise a full 108-card deal with fair AI, slow the table down, inspect play history, train card counting and replay every move. Learn fast. Play with grace.

Long-form/Hacker News introduction:

> Guan Dan is a two-deck partnership climbing game with a large decision surface and a steep first-table learning curve. GuanDan Lab separates deterministic rules from probabilistic Agent policy: an AI receives only seat-visible state and legal action IDs, while every returned move is checked locally. The project includes Chinese/English onboarding, 32 competition-profile conformance checks, optional compatible-model and ElevenLabs adapters, Docker + SQLite self-hosting and a server-authoritative four-player Beta. The hosted demo intentionally stays in local mode so it does not pretend paid or persistent services are configured.

## 传播角度

1. **临时上桌的真实焦虑**：不是“成为职业高手”，而是“不让全桌等我”。
2. **AI 公平性**：Agent 只收到当前座位可见信息与合法动作 ID，输出仍需规则引擎校验。
3. **向上社交但不媚上**：训练回应、节奏和搭档意识，不训练故意输牌或串通。
4. **可验证的开源规则**：规则争议有专门 Issue 模板，修改必须附最小牌例、来源和回归测试。
5. **可自托管**：Docker、SQLite、兼容模型 Base URL、Google OAuth 与 ElevenLabs 都是可选配置。

## 素材清单

- `public/launch-poster.png`：无文字横版牌桌主视觉，适合文章头图与社交媒体。
- `public/walkthrough.gif`：真实产品界面演示，依次展示入口、课程、记牌和 AI 牌桌流程。
- `public/screenshots/`：主页、课程、记牌和 AI 牌桌的真实 1440×900 截图。
- `public/og.png`：站点链接预览图。
- `public/characters.jpg`：陈总、小顾、林姐与学员的角色合照。
- `public/course-storyboard.jpg`：认牌、决策、配合、记忆四步学习故事，适合课程介绍与长图配图。
- `public/social-transformation.jpg`：从临时上桌紧张到训练后从容配合的左右对照主视觉，适合英文发布、博客和社交媒体。
- `public/favicon.svg`：项目图标。

这些图片是为本项目生成的原创像素风素材。对外使用时不要把虚构角色描述成真实企业家、投资人或公众人物。

## 发布检查表

- 公开 Demo 可匿名访问，规则抽屉、AI 牌桌、历史和记牌训练正常。
- GitHub CI 通过类型、Lint、单元、覆盖率、构建、E2E 与 Docker 持久化烟测。
- Release notes 明确标注公开 Demo 与自托管 Beta 的差异。
- 不发布 API key、真实用户牌局、Google 邮箱、生产数据库或私人收款信息。
- 传播数据只使用可验证指标；不要编造 star、用户数、投资人偏好或胜率。
