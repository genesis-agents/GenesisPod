import { Injectable } from "@nestjs/common";
import { isWorkspaceAiV2Enabled } from "./common/utils/feature-flags";

export interface AppInfo {
  message: string;
  version: string;
  docs: string;
  health: string;
  workspaceAiV2Enabled: boolean;
}

@Injectable()
export class AppService {
  getHello(): AppInfo {
    return {
      message: "Welcome to Raven AI Engine API",
      version: "1.0.0",
      docs: "/api/v1",
      health: "/api/v1/health",
      workspaceAiV2Enabled: isWorkspaceAiV2Enabled(),
    };
  }
}
