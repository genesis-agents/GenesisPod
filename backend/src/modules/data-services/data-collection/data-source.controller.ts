import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  DataSourceService,
  CreateDataSourceDto,
  UpdateDataSourceDto,
} from "./data-source.service";
import { DataSourceStatus, DataSourceType } from "@prisma/client";

@Controller("data-collection/sources")
export class DataSourceController {
  constructor(private readonly dataSourceService: DataSourceService) {}

  /**
   * 创建数据源
   * POST /data-collection/sources
   */
  @Post()
  async create(@Body() dto: CreateDataSourceDto) {
    const dataSource = await this.dataSourceService.create(dto);
    return {
      success: true,
      data: dataSource,
    };
  }

  /**
   * 批量创建数据源
   * POST /data-collection/sources/bulk
   */
  @Post("bulk")
  async bulkCreate(@Body() dtos: CreateDataSourceDto[]) {
    const result = await this.dataSourceService.bulkCreate(dtos);
    return {
      success: true,
      data: result,
    };
  }

  /**
   * 获取所有数据源
   * GET /data-collection/sources
   */
  @Get()
  async findAll(
    @Query("type") type?: DataSourceType,
    @Query("status") status?: DataSourceStatus,
    @Query("category") category?: string,
  ) {
    const sources = await this.dataSourceService.findAll({
      type,
      status,
      category,
    });
    return {
      success: true,
      data: sources,
      total: sources.length,
    };
  }

  /**
   * 获取统计摘要
   * GET /data-collection/sources/stats
   */
  @Get("stats")
  async getStats() {
    const stats = await this.dataSourceService.getStatsSummary();
    return {
      success: true,
      data: stats,
    };
  }

  /**
   * 获取单个数据源
   * GET /data-collection/sources/:id
   */
  @Get(":id")
  async findOne(@Param("id") id: string) {
    const dataSource = await this.dataSourceService.findOne(id);
    return {
      success: true,
      data: dataSource,
    };
  }

  /**
   * 更新数据源
   * PUT /data-collection/sources/:id
   */
  @Put(":id")
  async update(@Param("id") id: string, @Body() dto: UpdateDataSourceDto) {
    const dataSource = await this.dataSourceService.update(id, dto);
    return {
      success: true,
      data: dataSource,
    };
  }

  /**
   * 删除数据源
   * DELETE /data-collection/sources/:id
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string) {
    await this.dataSourceService.remove(id);
  }

  /**
   * 测试数据源连接
   * POST /data-collection/sources/:id/test
   */
  @Post(":id/test")
  async test(@Param("id") id: string) {
    const result = await this.dataSourceService.test(id);
    return {
      success: result.success,
      message: result.message,
    };
  }

  /**
   * 暂停数据源
   * POST /data-collection/sources/:id/pause
   */
  @Post(":id/pause")
  async pause(@Param("id") id: string) {
    const dataSource = await this.dataSourceService.update(id, {
      status: "PAUSED",
    });
    return {
      success: true,
      data: dataSource,
    };
  }

  /**
   * 恢复数据源
   * POST /data-collection/sources/:id/resume
   */
  @Post(":id/resume")
  async resume(@Param("id") id: string) {
    const dataSource = await this.dataSourceService.update(id, {
      status: "ACTIVE",
    });
    return {
      success: true,
      data: dataSource,
    };
  }

  /**
   * 修复已知的RSS URL问题
   * POST /data-collection/sources/fix-rss-urls
   */
  @Post("fix-rss-urls")
  async fixRssUrls() {
    const result = await this.dataSourceService.fixKnownRssUrls();
    return {
      success: true,
      data: result,
    };
  }
}
