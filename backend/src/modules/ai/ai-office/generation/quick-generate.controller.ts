import { Controller, Post, Body } from "@nestjs/common";
import { QuickGenerateService } from "./quick-generate.service";
import { QuickGenerateDto } from "./quick-generate.dto";
import { IntentParserService } from "../core";

@Controller("ai-office")
export class QuickGenerateController {
  constructor(
    private readonly quickGenerateService: QuickGenerateService,
    private readonly intentParserService: IntentParserService,
  ) {}

  @Post("quick-generate")
  async quickGenerate(
    @Body()
    body: QuickGenerateDto,
  ) {
    return this.quickGenerateService.generate(body);
  }

  /**
   * 解析用户自然语言输入的意图
   * 提取 URL、风格、页数、配色等参数
   */
  @Post("parse-intent")
  async parseIntent(@Body() body: { input: string }) {
    return this.intentParserService.parseIntent(body.input);
  }
}
