import { describe, expect, it } from "vitest";
import { remotePersonaInstruction } from "../../lib/game/ai";

describe("fictional server-side agent personas", () => {
  it("gives all three seats distinct, bounded policies with the same fair-play guard", () => {
    const prompts = ["control", "partnerFirst", "tempo"].map((id) =>
      remotePersonaInstruction(id as "control" | "partnerFirst" | "tempo"),
    );
    expect(new Set(prompts).size).toBe(3);
    for (const prompt of prompts) {
      expect(prompt).toContain("不得猜测或索要未提供的暗牌");
      expect(prompt).toContain("不得故意放水");
      expect(prompt).not.toMatch(/陈天桥|Tianqiao|Apodex|内部语料|盛大/u);
    }
    expect(prompts[0]).toContain("虚构角色“陈总”");
    expect(prompts[1]).toContain("虚构角色“小顾”");
    expect(prompts[2]).toContain("虚构角色“林姐”");
  });
});
