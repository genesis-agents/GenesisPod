import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { DataCollectionSchedulerService } from "./data-collection-scheduler.service";
import {
  SchedulerStatus,
  TriggerResult,
  UpdateSchedulerConfigDto,
} from "./data-collection-scheduler.types";

/**
 * Data Collection Scheduler Controller
 * 提供调度器管理 API 端点
 */
@Controller("data-collection/scheduler")
export class DataCollectionSchedulerController {
  private readonly logger = new Logger(DataCollectionSchedulerController.name);

  constructor(
    private readonly schedulerService: DataCollectionSchedulerService,
  ) {}

  /**
   * 获取调度器状态
   * GET /data-collection/scheduler/status
   */
  @Get("status")
  async getStatus(): Promise<{ success: boolean; data: SchedulerStatus }> {
    this.logger.log("Getting scheduler status");
    const status = await this.schedulerService.getStatus();
    return { success: true, data: status };
  }

  /**
   * 手动触发单个资源类型的采集
   * POST /data-collection/scheduler/trigger/:resourceType
   */
  @Post("trigger/:resourceType")
  @HttpCode(HttpStatus.OK)
  async triggerByType(
    @Param("resourceType") resourceType: string,
  ): Promise<{ success: boolean; data: TriggerResult }> {
    this.logger.log(`Triggering collection for ${resourceType}`);
    const result =
      await this.schedulerService.executeCollectionForResourceType(
        resourceType,
      );
    return { success: result.success, data: result };
  }

  /**
   * 手动触发所有类型的采集
   * POST /data-collection/scheduler/trigger-all
   */
  @Post("trigger-all")
  @HttpCode(HttpStatus.OK)
  async triggerAll(): Promise<{ success: boolean; data: TriggerResult[] }> {
    this.logger.log("Triggering collection for all resource types");
    const results = await this.schedulerService.triggerAll();
    const allSuccess = results.every((r) => r.success);
    return { success: allSuccess, data: results };
  }

  /**
   * 更新调度器配置
   * PUT /data-collection/scheduler/config
   */
  @Put("config")
  async updateConfig(
    @Body() dto: UpdateSchedulerConfigDto,
  ): Promise<{ success: boolean; data: SchedulerStatus }> {
    this.logger.log(`Updating scheduler config: ${JSON.stringify(dto)}`);
    const status = await this.schedulerService.updateConfig(dto);
    return { success: true, data: status };
  }

  /**
   * 重启所有调度器
   * POST /data-collection/scheduler/restart
   */
  @Post("restart")
  @HttpCode(HttpStatus.OK)
  async restart(): Promise<{ success: boolean; message: string }> {
    this.logger.log("Restarting all schedulers");
    await this.schedulerService.restartSchedulers();
    return { success: true, message: "Schedulers restarted successfully" };
  }
}
