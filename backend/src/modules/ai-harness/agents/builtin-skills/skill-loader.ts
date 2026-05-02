/**
 * SkillLoader — 从文件系统加载 SKILL.md 文件到 SkillRegistry
 *
 * 约定目录结构：
 *   harness/skills/built-in/
 *     web-research/SKILL.md
 *     critical-review/SKILL.md
 *
 * OnModuleInit 时自动扫描并注册全部内置 Skill；失败的 skill 记 warn 不阻塞启动。
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import type { ISkillLoader, ISkill } from "../abstractions";
import { parseSkillMarkdown, SkillParseError } from "./skill-parser";
import { BuiltinSkillCatalog } from "./skill-registry";

const BUILT_IN_DIR = path.resolve(__dirname, "built-in");
const SKILL_FILENAME = "SKILL.md";

@Injectable()
export class SkillLoader implements ISkillLoader, OnModuleInit {
  private readonly logger = new Logger(SkillLoader.name);

  constructor(private readonly registry: BuiltinSkillCatalog) {}

  async onModuleInit(): Promise<void> {
    try {
      const skills = await this.loadAll();
      this.registry.registerAll(skills);
      this.logger.log(
        `Loaded ${skills.length} built-in SKILL.md files into SkillRegistry`,
      );
    } catch (err) {
      this.logger.warn(
        `Skill auto-load skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async loadById(id: string): Promise<ISkill | null> {
    const filePath = path.join(BUILT_IN_DIR, id, SKILL_FILENAME);
    try {
      const raw = await fs.promises.readFile(filePath, "utf-8");
      return parseSkillMarkdown(raw, filePath);
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "ENOENT"
      ) {
        return null;
      }
      this.logger.warn(
        `Failed to load skill '${id}': ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  async loadAll(): Promise<readonly ISkill[]> {
    const exists = await fs.promises
      .access(BUILT_IN_DIR)
      .then(() => true)
      .catch(() => false);
    if (!exists) return [];

    const entries = await fs.promises.readdir(BUILT_IN_DIR, {
      withFileTypes: true,
    });

    const skills: ISkill[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const filePath = path.join(BUILT_IN_DIR, entry.name, SKILL_FILENAME);
      try {
        const raw = await fs.promises.readFile(filePath, "utf-8");
        skills.push(parseSkillMarkdown(raw, filePath));
      } catch (err) {
        if (err instanceof SkillParseError) {
          this.logger.warn(`Skill '${entry.name}' parse error: ${err.message}`);
        } else if (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code: string }).code === "ENOENT"
        ) {
          this.logger.debug(
            `Directory '${entry.name}' has no SKILL.md — skipped`,
          );
        } else {
          this.logger.warn(
            `Failed to read '${entry.name}': ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
    return skills;
  }
}
