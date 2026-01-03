import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ConfigurationService } from "../services/configuration.service";

@Controller("data-management/configurations")
export class ConfigurationController {
  constructor(private readonly configurationService: ConfigurationService) {}

  @Get()
  async getConfigs(@Query("resourceType") resourceType: string) {
    return this.configurationService.getConfigs(resourceType);
  }

  @Patch(":id/status")
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param("id") id: string,
    @Body("isActive") isActive: boolean,
  ) {
    return this.configurationService.updateStatus(id, isActive);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConfig(@Param("id") id: string) {
    return this.configurationService.deleteConfig(id);
  }
}
