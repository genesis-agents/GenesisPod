/**
 * 执行 Agent 响应 DTO
 */

import { ApiProperty } from "@nestjs/swagger";
import { AgentTaskStatus } from "../core";

/**
 * 执行响应 DTO
 */
export class ExecuteResponseDto {
  @ApiProperty({
    description: "任务 ID",
    example: "clxxxx12345",
  })
  taskId!: string;

  @ApiProperty({
    description: "任务状态",
    enum: AgentTaskStatus,
    example: AgentTaskStatus.PENDING,
  })
  status!: AgentTaskStatus;
}
