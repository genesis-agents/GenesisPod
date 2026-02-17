/**
 * Research Data Export Adapter
 *
 * Implements the IResearchDataExport interface defined in the Office module.
 * Registered in ResearchModule and exported via RESEARCH_DATA_EXPORT token,
 * allowing Office to depend on the abstract interface rather than the
 * concrete ResearchModule.
 */

import { Injectable } from "@nestjs/common";
import {
  IResearchDataExport,
  IExportableResearchData,
  IResearchListItem,
} from "../../office/interfaces/data-export.interface";
import { ResearchDataExportService } from "./research-data-export.service";

@Injectable()
export class ResearchDataExportAdapter implements IResearchDataExport {
  constructor(
    private readonly researchDataExportService: ResearchDataExportService,
  ) {}

  getTopicForExport(
    topicId: string,
    userId: string,
  ): Promise<IExportableResearchData> {
    return this.researchDataExportService.getTopicForExport(topicId, userId);
  }

  listTopicsForExport(
    userId: string,
    limit?: number,
  ): Promise<IResearchListItem[]> {
    return this.researchDataExportService.listTopicsForExport(userId, limit);
  }
}
