import { Injectable } from "@nestjs/common";
import { TemplateBaseHelper } from "./templates/template-base.helper";

/**
 * Template generator class that handles all template generation logic
 * Extracted from InfographicTemplateService to reduce file size
 *
 * This class contains all the template generation methods:
 * - generateConsultingInfographicHTML (cards layout)
 * - generateCenterVisualHTML
 * - generateTimelineHTML
 * - generateComparisonHTML
 * - generateStatisticsHTML
 * - generateChecklistHTML
 * - generateFunnelHTML
 * - generateMatrixHTML
 * - generateRankingHTML
 */
@Injectable()
export class InfographicTemplatesGenerator extends TemplateBaseHelper {
  /**
   * NOTE: This file will contain the extracted template generation methods
   * from the original infographic-template.service.ts file.
   *
   * Each method will be moved here to keep the main service file under 500 lines.
   * The methods maintain their original signatures and logic.
   */
  // Template methods will be added here during the migration
  // For now, this is a placeholder that will be populated with the actual methods
}
