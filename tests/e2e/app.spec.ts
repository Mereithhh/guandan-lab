import { expect, test, type Page } from "@playwright/test";
import { newGame } from "../../lib/game/engine";
import { createNineGridDrill } from "../../lib/services/memory-drill";

const COURSE_ANSWERS = [
  ["三带二", "三连对（木板）", "二连三（钢板）", "同花顺"],
  ["出 8♠ 8♥", "出 9♠ 9♥", "过牌", "小顾的搭档，也就是你"],
  [
    "这手把牌权送得很准。",
    "没事，下一圈我来补位。",
    "马上，我先确认是不是钢板。",
  ],
  ["2 张", "6 张", "7 张"],
];
async function completeCourse(page: Page) {
  for (let lesson = 0; lesson < COURSE_ANSWERS.length; lesson++) {
    for (
      let question = 0;
      question < COURSE_ANSWERS[lesson].length;
      question++
    ) {
      await page
        .getByRole("button", {
          name: COURSE_ANSWERS[lesson][question],
          exact: true,
        })
        .click();
      await expect(page.getByText("判断正确")).toBeVisible();
      if (question < COURSE_ANSWERS[lesson].length - 1)
        await page.getByTestId("lesson-next-question").click();
    }
    await expect(page.getByTestId("lesson-complete")).toBeVisible();
    if (lesson < COURSE_ANSWERS.length - 1)
      await page.getByRole("button", { name: "下一节 →" }).click();
  }
}
async function unlockOnline(page: Page) {
  await page.getByTestId("start-game").click();
  await completeCourse(page);
  await page.getByRole("button", { name: /G 掼蛋实验室/u }).click();
}
async function countDrillAnswer(page: Page) {
  const prompt = (await page.getByTestId("count-prompt").innerText()).match(
    /共 (\d+) 张(.+)，/u,
  );
  expect(prompt).not.toBeNull();
  const total = Number(prompt![1]),
    label = prompt![2],
    target = label.startsWith("级牌 ") ? label.slice(3) : label,
    cards = await page
      .locator(".count-events .playing-card")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label") || ""),
      ),
    seen = cards.filter((card) =>
      target === "王" ? card.includes("王") : card.endsWith(target),
    ).length;
  return total - seen;
}

test("rules and active provider modes are always visible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("provider-status")).toContainText(
    "Agent · 本地规则 / 语音 · 设备语音",
  );
  await page.getByTestId("rules-button").click();
  await expect(page.getByRole("dialog", { name: "完整规则" })).toContainText(
    "进贡与还贡",
  );
  await page.getByTestId("close-rules").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("discovery metadata is truthful and the share action uses the canonical root", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        (window as Window & { __sharePayload?: ShareData }).__sharePayload =
          data;
      },
    });
  });
  await page.goto("/");
  const canonical = await page
    .locator('link[rel="canonical"]')
    .getAttribute("href");
  expect(canonical).toBeTruthy();
  expect(new URL(canonical!).origin).toBe(new URL(page.url()).origin);
  expect(await page.locator('link[rel="manifest"]').getAttribute("href")).toBe(
    "/manifest.webmanifest",
  );
  const structured = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ||
      "{}",
  ) as {
    "@type"?: string[];
    url?: string;
    isAccessibleForFree?: boolean;
    codeRepository?: string;
  };
  expect(structured["@type"]).toEqual(
    expect.arrayContaining(["SoftwareApplication", "LearningResource"]),
  );
  expect(structured.url).toBe(canonical);
  expect(structured.isAccessibleForFree).toBe(true);
  expect(structured.codeRepository).toBe(
    "https://github.com/Mereithhh/guandan-lab",
  );
  const manifestResponse = await request.get("/manifest.webmanifest"),
    manifest = (await manifestResponse.json()) as {
      name?: string;
      start_url?: string;
      icons?: { sizes?: string; purpose?: string }[];
    };
  expect(manifestResponse.ok()).toBe(true);
  expect(manifest.name).toBe("GuanDan Lab");
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons?.map((icon) => icon.sizes)).toEqual(
    expect.arrayContaining(["192x192", "512x512"]),
  );
  expect(
    manifest.icons?.some(
      (icon) => icon.sizes === "512x512" && icon.purpose === "maskable",
    ),
  ).toBe(true);
  for (const path of ["/icon-192.png", "/icon-512.png"])
    expect((await request.get(path)).ok()).toBe(true);
  const robots = await (await request.get("/robots.txt")).text(),
    sitemap = await (await request.get("/sitemap.xml")).text();
  expect(robots).toContain("Disallow: /api/");
  expect(robots).toContain("/sitemap.xml");
  expect(sitemap).toContain(canonical!);
  await page.getByTestId("share-site").click();
  await expect(page.getByRole("status")).toContainText("分享完成");
  const payload = await page.evaluate(
    () => (window as Window & { __sharePayload?: ShareData }).__sharePayload,
  );
  expect(payload?.url).toBe(new URL("/", page.url()).toString());
  expect(payload?.text).toContain("3 位 AI 牌友");
  await page.getByTestId("locale-toggle").click();
  await expect(page.getByTestId("share-site")).toContainText(
    "Share with a player",
  );
  const footerShare = page.getByTestId("share-site-footer"),
    footerBox = await footerShare.boundingBox();
  expect(footerBox?.height).toBeGreaterThanOrEqual(44);
  expect(footerBox?.width).toBeGreaterThanOrEqual(44);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as Window & { __copiedUrl?: string }).__copiedUrl = text;
        },
      },
    });
  });
  await footerShare.click();
  await expect(page.getByText("Link copied")).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as Window & { __copiedUrl?: string }).__copiedUrl,
    ),
  ).toBe(new URL("/", page.url()).toString());
});
test("configured remote providers are disclosed without exposing configuration", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "gd-course-v1",
      JSON.stringify({
        schemaVersion: 1,
        progress: [3, 3, 2, 2],
        mastered: [true, true, true, true],
        mistakes: [0, 0, 0, 0],
      }),
    ),
  );
  await page.route("**/api/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "local",
        persistent: false,
        googleOAuth: false,
        onlineMatching: false,
        profile: null,
        agentProvider: "compatible",
        voiceProvider: "elevenlabs",
      }),
    }),
  );
  await page.goto("/");
  await expect(page.getByTestId("provider-status")).toContainText(
    "Agent · 兼容大模型优先 / 语音 · ElevenLabs 优先",
  );
  await expect(page.getByTestId("provider-status")).not.toContainText(
    /secret|api|model/i,
  );
  await page
    .getByRole("button", { name: /整副牌 AI 完整陪练 进入 108 张四人牌桌/u })
    .click();
  await expect(page.getByTestId("agent-mode")).toContainText("3/3 LLM 优先");
  await expect(page.getByTestId("agent-persona-1")).toContainText("LLM Agent");
  await expect(page.getByTestId("agent-persona-2")).toContainText("LLM Agent");
  await expect(page.getByTestId("agent-persona-3")).toContainText("LLM Agent");
  await expect(page.locator(".avatar-boss")).toHaveCSS(
    "background-image",
    /chen-avatar-v2\.png/u,
  );
  await page.getByTestId("agent-mode").click();
  await expect(page.getByTestId("agent-mode")).toContainText("本地策略模式");
});
test("English onboarding is keyboard accessible, complete, and persistent", async ({
  page,
}) => {
  await page.goto("/");
  const toggle = page.getByTestId("locale-toggle");
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: /Learn fast, play with grace\./u }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("footer")).toContainText("Cards have winners");
  await expect(page.locator("footer")).not.toContainText("牌技有输赢");
  await page.getByTestId("rules-button").click();
  const rules = page.getByRole("dialog", { name: "Full rules" }),
    closeRules = page.getByTestId("close-rules");
  await expect(rules).toContainText(
    "A single contributor holding both big jokers",
  );
  await expect(closeRules).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(closeRules).toBeFocused();
  await closeRules.click();
  await page.getByRole("button", { name: "Memory grid" }).click();
  await expect(
    page.getByRole("heading", { name: "Card Memory Lab" }),
  ).toBeVisible();
  await expect(page.getByTestId("count-prompt")).toContainText(
    "Two decks contain",
  );
  await expect(page.locator("main")).not.toContainText("累计准确率");
  await page.goto("/?login=ok");
  await expect(page.getByRole("status")).toContainText(
    "Google sign-in succeeded",
  );
  await expect(
    page.getByRole("button", { name: "Dismiss sign-in notice" }),
  ).toBeVisible();
  await page.getByTestId("start-game").click();
  await expect(
    page.getByRole("heading", { name: "Table-ready crash course" }),
  ).toBeVisible();
  await expect(page.getByText("What is this five-card hand?")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("locale-toggle")).toHaveText("中文");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
test("home offers both recommended training and direct full play", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("direct-game")).toBeVisible();
  await page.getByTestId("direct-game").click();
  await expect(page.getByText("你与小顾一队")).toBeVisible();
  await page.getByRole("button", { name: /G 掼蛋实验室/u }).click();
  await page.getByRole("button", { name: /2 MIN 记牌热身/u }).click();
  await expect(page.getByRole("heading", { name: "记牌训练场" })).toBeVisible();
  await page.getByRole("button", { name: /G 掼蛋实验室/u }).click();
  await page
    .getByRole("button", { name: /整副牌 AI 完整陪练 进入 108 张四人牌桌/u })
    .click();
  await expect(page.getByText("你与小顾一队")).toBeVisible();
  await page.getByRole("button", { name: /G 掼蛋实验室/u }).click();
  await page.getByTestId("start-game").click();
  await expect(
    page.getByRole("heading", { name: "救急上桌路线" }),
  ).toBeVisible();
});
test("course progress survives reload without unlocking future chapters", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("start-game").click();
  for (let question = 0; question < COURSE_ANSWERS[0].length; question++) {
    await page
      .getByRole("button", { name: COURSE_ANSWERS[0][question], exact: true })
      .click();
    if (question < COURSE_ANSWERS[0].length - 1)
      await page.getByTestId("lesson-next-question").click();
  }
  await page.getByRole("button", { name: "下一节 →" }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("gd-course-v1")))
    .toContain('"mastered":[true');
  await page.reload();
  await page.getByRole("button", { name: "极速课程" }).click();
  await expect(
    page.getByRole("heading", { name: "轮到我该做什么" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /一眼认牌型 已掌握/u }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: /03 老板局不冷场/u }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "出 8♠ 8♥", exact: true }).click();
  await page.getByTestId("lesson-next-question").click();
  await expect(page.getByText(/当前打 2。陈总刚出 7♠ 7♥/u)).toBeVisible();
});
test("mobile question advance keeps the new prompt in view and the open-source CTA reachable", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile",
    "mobile-only viewport assertion",
  );
  await page.goto("/");
  const github = page.getByTestId("mobile-github");
  await expect(github).toBeVisible();
  await expect(github).toHaveAttribute(
    "href",
    "https://github.com/Mereithhh/guandan-lab",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => window.innerWidth),
  );
  await page.getByTestId("start-game").click();
  await page.getByRole("button", { name: "三带二", exact: true }).click();
  await page.getByTestId("lesson-next-question").click();
  const scene = page.getByText("牌面：3♠ 3♥ 4♠ 4♥ 5♠ 5♥"),
    nav = page.locator(".mobile-nav");
  await expect(scene).toBeInViewport();
  const [sceneBox, navBox] = await Promise.all([
    scene.boundingBox(),
    nav.boundingBox(),
  ]);
  expect(sceneBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  expect(sceneBox!.y + sceneBox!.height).toBeLessThan(navBox!.y);
});
test("narrow tablet navigation keeps all five actions in one row", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "desktop browser with a 720px regression viewport",
  );
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto("/");
  const nav = page.locator(".mobile-nav"),
    items = nav.locator("button,a");
  await expect(nav).toBeVisible();
  await expect(items).toHaveCount(5);
  const boxes = await items.evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }),
  );
  expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1);
  expect(boxes.every((box) => box.width >= 100 && box.height >= 44)).toBe(true);
  expect((await nav.boundingBox())!.height).toBeLessThan(80);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => window.innerWidth),
  );
});
test("beginner mastery path blocks guessing before a readable, paced AI table", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Date.now = () => 20260820;
  });
  await page.goto("/");
  await page.getByTestId("start-game").click();
  await expect(page.getByRole("button", { name: "下一节 →" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /02 轮到我该做什么/u }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "顺子", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("再想一下");
  await expect(page.getByRole("button", { name: "下一节 →" })).toBeDisabled();
  await completeCourse(page);
  await expect(page.getByText("上桌前能力清单")).toBeVisible();
  await expect(page.getByTestId("lesson-start-game")).toBeEnabled();
  await page.getByTestId("lesson-start-game").click();
  await expect(page.getByText("你与小顾一队")).toBeVisible();
  await expect(page.getByText(/陈总/).first()).toBeVisible();
  await expect(page.getByTestId("agent-persona-1")).toContainText("稳健控场");
  await expect(page.getByTestId("agent-persona-2")).toContainText("搭档优先");
  await expect(page.getByTestId("agent-persona-3")).toContainText("效率突围");
  await page.getByTestId("agent-persona-2").locator("summary").click();
  await expect(
    page.getByTestId("agent-persona-2").getByText(/只剩 4 张以内/u),
  ).toBeVisible();
  await expect(page.getByTestId("save-mode")).toContainText(
    /存档 · (本机|完成后保存)/,
  );
  await expect(page.getByTestId("voice-toggle")).toContainText("语音 OFF");
  await expect(page.getByTestId("ai-speed")).toContainText(
    "AI 节奏 · 舒缓 · 2.2s",
  );
  await page.getByTestId("ai-speed").click();
  await expect(page.getByTestId("ai-speed")).toContainText(
    "AI 节奏 · 讲解 · 3.5s",
  );
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("gd-ai-speed-v1")))
    .toBe("2");
  expect(await page.getByTestId("rank-group").count()).toBeGreaterThan(1);
  await expect(page.getByTestId("rank-group").first()).toHaveAttribute(
    "aria-label",
    /组，共 \d+ 张/u,
  );
  await expect(page.locator(".rank-count").first()).toBeVisible();
  await expect(page.getByTestId("live-history")).toHaveAttribute("open", "");
  await expect(page.getByTestId("live-history")).toContainText("最新在上");
  await page.getByTestId("hint-button").click();
  await expect(
    page.locator('.hand .playing-card[aria-pressed="true"]'),
  ).not.toHaveCount(0);
  await page.getByTestId("play-button").click();
  await expect(page.getByText(/这手是/)).toBeVisible();
  await expect(page.getByTestId("live-history")).toContainText("你");
});
test("five mini endgames bridge mastery to the full table with immediate feedback", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "gd-course-v1",
      JSON.stringify({
        schemaVersion: 1,
        progress: [3, 3, 2, 2],
        mastered: [true, true, true, true],
        mistakes: [0, 0, 0, 0],
      }),
    ),
  );
  await page.goto("/");
  await page.getByTestId("start-puzzles").click();
  await expect(
    page.getByRole("heading", { name: "陈总局 · 迷你残局" }),
  ).toBeVisible();
  await expect(page.getByLabel("公开剩余张数")).toContainText("小顾1 张");
  await page.getByTestId("locale-toggle").click();
  await expect(
    page.getByRole("heading", { name: "Chen table · mini endgames" }),
  ).toBeVisible();
  await expect(page.getByLabel("Public remaining card counts")).toContainText(
    "Gu1 cards",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => window.innerWidth),
  );
  await page.getByTestId("locale-toggle").click();
  await page.getByTestId("puzzle-option").nth(1).click();
  await expect(page.getByRole("alert")).toContainText("本关首答未得分");
  await page.getByRole("button", { name: /G 掼蛋实验室/u }).click();
  await page.getByTestId("start-puzzles").click();
  await expect(page.getByRole("alert")).toContainText("本关首答未得分");
  await expect(page.getByTestId("puzzle-option").first()).toBeEnabled();
  await page.getByTestId("puzzle-option").first().click();
  await expect(page.getByRole("status")).toContainText("规则：");
  for (let puzzle = 1; puzzle < 5; puzzle++) {
    await page.getByTestId("puzzle-next").click();
    await page.getByTestId("puzzle-option").first().click();
  }
  await expect(page.getByText(/5 关完成，首答 4 \/ 5/u)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => window.innerWidth),
  );
  await page.getByTestId("puzzle-start-game").click();
  await expect(page.getByText("你与小顾一队")).toBeVisible();
});
test("overflowing desktop hand keeps its first and last cards directly clickable", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop overflow regression");
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.addInitScript(() => {
    Date.now = () => 20260820;
    localStorage.setItem(
      "gd-course-v1",
      JSON.stringify({
        schemaVersion: 1,
        progress: [3, 3, 2, 2],
        mastered: [true, true, true, true],
        mistakes: [0, 0, 0, 0],
      }),
    );
  });
  await page.goto("/");
  await page.getByRole("button", { name: /G 掼蛋实验室/u }).click();
  await page
    .getByRole("button", { name: /整副牌 AI 完整陪练 进入 108 张四人牌桌/u })
    .click();
  const cards = page.locator(".hand .playing-card");
  await cards.first().click({ position: { x: 12, y: 8 } });
  await expect(cards.first()).toHaveAttribute("aria-pressed", "true");
  await cards.last().click();
  await expect(cards.last()).toHaveAttribute("aria-pressed", "true");
});
test("mobile same-rank cards form vertical physical piles and remain selectable", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile",
    "mobile touch-target regression",
  );
  await page.addInitScript(() => {
    Date.now = () => 20260820;
    localStorage.setItem(
      "gd-course-v1",
      JSON.stringify({
        schemaVersion: 1,
        progress: [3, 3, 2, 2],
        mastered: [true, true, true, true],
        mistakes: [0, 0, 0, 0],
      }),
    );
  });
  await page.goto("/");
  await page.getByRole("button", { name: /G 掼蛋实验室/u }).click();
  await page
    .getByRole("button", { name: /整副牌 AI 完整陪练 进入 108 张四人牌桌/u })
    .click();
  const groups = page.getByTestId("rank-group");
  let pair = null;
  for (let index = 0; index < (await groups.count()); index++) {
    const cards = groups.nth(index).locator(".playing-card");
    if ((await cards.count()) > 1) {
      pair = cards;
      break;
    }
  }
  expect(pair).not.toBeNull();
  const first = await pair!.nth(0).boundingBox(),
    second = await pair!.nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(Math.abs(second!.x - first!.x)).toBeLessThanOrEqual(2);
  expect(second!.y - first!.y).toBeGreaterThanOrEqual(16);
  await pair!.nth(0).click({ position: { x: 12, y: 8 } });
  await expect(pair!.nth(0)).toHaveAttribute("aria-pressed", "true");
  await pair!.nth(1).click({ position: { x: 12, y: 8 } });
  await expect(pair!.nth(1)).toHaveAttribute("aria-pressed", "true");
});
test("the red-heart level card is visibly and accessibly marked as wild", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Date.now = () => 0;
    localStorage.setItem(
      "gd-course-v1",
      JSON.stringify({
        schemaVersion: 1,
        progress: [3, 3, 2, 2],
        mastered: [true, true, true, true],
        mistakes: [0, 0, 0, 0],
      }),
    );
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /整副牌 AI 完整陪练 进入 108 张四人牌桌/u })
    .click();
  await page.getByRole("button", { name: "新比赛" }).click();
  const wild = page.locator(".hand .wild-card");
  await expect(wild).toHaveCount(1);
  await expect(wild).toHaveAttribute("aria-label", "♥2，红桃级牌，逢人配");
  await expect(wild.locator(".wild-badge")).toHaveText("配");
});
test("long result coaching remains scrollable with actions reachable on small and landscape screens", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "one synthetic responsive-layout contract is sufficient",
  );
  await page.goto("/");
  await page.evaluate(() => {
    const modal = document.createElement("div");
    modal.className = "result-modal";
    modal.innerHTML = `<div class="paper-panel"><h2>本副结束</h2><div class="score-split"><div><b>88</b><span>牌技分</span></div><div><b>90</b><span>社交分</span></div></div><p class="mode-chip">大模型建议 · 公开事件 + 本地统计</p>${Array.from({ length: 4 }, (_, index) => `<p>• ${index + 1} ${"根据公开事件给出具体建议。".repeat(18)}</p>`).join("")}<p class="mode-chip dark">存档 · 云端已保存</p><div class="result-actions mt-5"><button class="pixel-button coral">贡还牌并继续</button><button class="pixel-button dark">查看回放</button></div></div>`;
    document.body.appendChild(modal);
  });
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    const panel = page.locator(".result-modal>.paper-panel"),
      actions = page.locator(".result-actions");
    await expect(panel).toBeVisible();
    await actions.scrollIntoViewIfNeeded();
    const box = await actions.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    await expect(actions.getByRole("button")).toHaveCount(2);
  }
});
test("event subtraction and nine-grid memory drills can both be completed", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Date.now = () => 20260820;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "记牌九宫格" }).click();
  await expect(page.getByTestId("memory-mode-count")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const remaining = await countDrillAnswer(page);
  await page
    .getByRole("button", { name: `${remaining} 张`, exact: true })
    .click();
  await page.getByTestId("count-submit").click();
  await expect(page.getByText("减法正确")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("gd-count-memory-v1")))
    .toContain('"correct":true');
  await page.getByTestId("count-next").click();
  await expect(page.getByText("第 2 轮")).toBeVisible();
  await page.getByTestId("memory-mode-grid").click();
  await expect(page.getByText("流行扩展训练法，并非竞赛规则")).toBeVisible();
  const drill = createNineGridDrill(20260820 % 1000003, 1);
  for (const [index, cell] of drill.cells.entries()) {
    for (let click = 0; click <= cell.initial; click++)
      await page.getByTestId(`memory-${index}`).click();
  }
  await page.getByTestId("memory-hide").click();
  await expect(page.getByText("已见牌快照 1")).toBeVisible();
  for (const [index, cell] of drill.cells.entries()) {
    for (let click = 0; click <= cell.remaining; click++)
      await page.getByTestId(`memory-${index}`).click();
  }
  await page.getByTestId("memory-submit").click();
  await expect(page.getByText("起手 9/9 · 行牌更新 9/9")).toBeVisible();
  await page.getByRole("button", { name: "进入下一轮" }).click();
  await expect(page.getByText("第 2 轮")).toBeVisible();
});
test("a missed count category is retrained with a new public sequence", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "记牌九宫格" }).click();
  const prompt = await page.getByTestId("count-prompt").innerText(),
    category = prompt.includes("级牌")
      ? "级牌"
      : prompt.includes("王")
        ? "王"
        : prompt.includes("A")
          ? "A"
          : "2",
    correct = await countDrillAnswer(page),
    answers = page.getByTestId("count-answer"),
    before = await page
      .locator(".count-events .playing-card")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label")).join("|"),
      );
  for (let index = 0; index < (await answers.count()); index++) {
    const button = answers.nth(index);
    if ((await button.innerText()) !== `${correct} 张`) {
      await button.click();
      break;
    }
  }
  await page.getByTestId("count-submit").click();
  await expect(page.getByRole("alert")).toContainText("下一轮会用新的牌序重练");
  await page.getByTestId("count-next").click();
  await expect(page.getByTestId("count-prompt")).toContainText(category);
  const after = await page
    .locator(".count-events .playing-card")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("aria-label")).join("|"),
    );
  expect(after).not.toBe(before);
});
test("four trained guests match into a private server-authoritative room", async ({
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "one cross-context room test is sufficient",
  );
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () => browser.newContext()),
  );
  try {
    const pages = await Promise.all(
      contexts.map(async (context) => {
        const page = await context.newPage();
        await page.goto("/");
        await expect(page.getByTestId("online-match")).toContainText(
          "完成基础验证",
        );
        await unlockOnline(page);
        await page.getByTestId("online-match").click();
        await page.getByTestId("join-online").click();
        return page;
      }),
    );
    for (const page of pages)
      await expect(page.getByText("真人牌桌 · 打")).toBeVisible({
        timeout: 10000,
      });
    let actor = null;
    for (const page of pages) {
      if (await page.getByText(/轮到你 · \d+s/u).isVisible()) {
        actor = page;
        break;
      }
    }
    expect(actor).toBeTruthy();
    const active = actor!;
    await active.locator(".online-hand .playing-card").last().click();
    await active.getByTestId("online-play").click();
    await expect(active.getByText(/服务器公平发牌 · 版本 1/u)).toBeVisible();
    active.once("dialog", (dialog) => dialog.accept());
    await active.getByRole("button", { name: "离开并取消本局" }).click();
    await expect(
      pages.find((page) => page !== active)!.getByText("牌局已取消"),
    ).toBeVisible({ timeout: 5000 });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
test("online lobby is usable on mobile after persisted training", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only coverage");
  await page.goto("/");
  await page.getByTestId("online-match").click();
  await expect(
    page.getByRole("heading", { name: "救急上桌路线" }),
  ).toBeVisible();
  await completeCourse(page);
  await page.getByRole("button", { name: /G 掼蛋实验室/u }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("gd-course-v1")))
    .toContain('"mastered":[true,true,true,true]');
  await page.reload();
  await expect(page.getByTestId("online-match")).not.toContainText(
    "完成基础验证",
  );
  await page.getByTestId("online-match").click();
  await expect(
    page.getByRole("heading", { name: "四人真人匹配" }),
  ).toBeVisible();
  await page.getByTestId("join-online").click();
  await expect(page.getByText(/等待牌友 · 已到/u)).toBeVisible();
  await page.getByRole("button", { name: "离开队列" }).click();
  await expect(page.getByTestId("join-online")).toBeVisible();
});
test("a locally queued finished game resumes cloud sync with the real analysis contract", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "one persistence lifecycle test is sufficient",
  );
  const replay = { ...newGame(987654), phase: "finished" as const };
  await page.addInitScript(
    (game) => localStorage.setItem("gd-history-v2", JSON.stringify([game])),
    replay,
  );
  let posts = 0,
    analysisScore: number | undefined;
  await page.route("**/api/progress", async (route) => {
    if (route.request().method() === "POST") {
      posts++;
      const body = route.request().postDataJSON() as {
        analysis?: { score?: number };
      };
      analysisScore = body.analysis?.score;
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({
        status: Number.isFinite(analysisScore) ? 200 : 400,
        contentType: "application/json",
        body: Number.isFinite(analysisScore)
          ? '{"stored":true}'
          : '{"error":"分析数据无效"}',
      });
    } else await route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "记牌九宫格" }).click();
  await expect.poll(() => posts).toBe(1);
  expect(analysisScore).toBeGreaterThanOrEqual(0);
  await expect
    .poll(
      async () =>
        await page.evaluate(
          () =>
            JSON.parse(
              localStorage.getItem("gd-cloud-synced-v1") || "[]",
            ) as number[],
        ),
    )
    .toContain(987654);
});
