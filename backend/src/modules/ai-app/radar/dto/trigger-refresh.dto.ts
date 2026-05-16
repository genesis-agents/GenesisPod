import { IsOptional, IsBoolean } from "class-validator";

export class TriggerRefreshDto {
  /**
   * 是否绕过 dedup window（仅 admin 调试用，service 内部还会再校验）。
   */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
