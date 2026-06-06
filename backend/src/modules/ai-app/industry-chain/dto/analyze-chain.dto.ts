import { IsString, IsNotEmpty, MaxLength } from "class-validator";

/** POST /industry-chain/analyze 请求体（M7：topic 校验 + 长度上限）。 */
export class AnalyzeChainDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  topic!: string;
}
