/**
 * AI Office - Data Export Interfaces
 *
 * Abstract contracts for importing data from Research and Writing modules.
 * Office depends on these interfaces (not on concrete classes), keeping
 * App-layer modules decoupled from each other.
 *
 * Providers are registered in Research/Writing modules and injected here
 * via DI tokens.
 */

// ============================================
// DI Tokens
// ============================================

export const RESEARCH_DATA_EXPORT = Symbol("RESEARCH_DATA_EXPORT");
export const RESEARCH_PROJECT_DATA_EXPORT = Symbol(
  "RESEARCH_PROJECT_DATA_EXPORT",
);
export const WRITING_DATA_EXPORT = Symbol("WRITING_DATA_EXPORT");

// ============================================
// Research Export Contract
// ============================================

export interface IResearchListItem {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  dimensionCount: number;
}

export interface IExportableResearchData {
  id: string;
  name: string;
  description: string | null;
  language: string | null;
  createdAt: Date;
  dimensions: Array<{
    name: string;
    description: string | null;
    sortOrder: number;
  }>;
  latestReport: {
    fullReport: string | null;
    charts: unknown;
    highlights: unknown;
    dimensionAnalyses: Array<{
      summary: string | null;
      dataPoints: unknown;
      dimension: {
        name: string;
      };
    }>;
  } | null;
}

export interface IResearchDataExport {
  getTopicForExport(
    topicId: string,
    userId: string,
  ): Promise<IExportableResearchData>;

  listTopicsForExport(
    userId: string,
    limit?: number,
  ): Promise<IResearchListItem[]>;
}

// ============================================
// Research Project Export Contract
// ============================================

export interface IResearchProjectListItem {
  id: string;
  name: string;
  description: string | null;
  researchType: string;
  createdAt: Date;
  outputCount: number;
}

export interface IExportableResearchProjectData {
  id: string;
  name: string;
  description: string | null;
  researchType: string;
  createdAt: Date;
  outputs: Array<{
    id: string;
    type: string;
    title: string;
    status: string;
    content: string | null;
  }>;
}

export interface IResearchProjectDataExport {
  getProjectForExport(
    projectId: string,
    userId: string,
  ): Promise<IExportableResearchProjectData>;

  listProjectsForExport(
    userId: string,
    limit?: number,
  ): Promise<IResearchProjectListItem[]>;
}

// ============================================
// Writing Export Contract
// ============================================

export interface IWritingListItem {
  id: string;
  name: string;
  genre: string | null;
  createdAt: Date;
  volumeCount: number;
}

export interface IExportableWritingData {
  id: string;
  name: string;
  genre: string | null;
  writingStyle: string | null;
  createdAt: Date;
  volumes: Array<{
    id: string;
    title: string;
    volumeNumber: number;
    chapters: Array<{
      id: string;
      title: string;
      chapterNumber: number;
      content: string | null;
    }>;
  }>;
}

export interface IWritingDataExport {
  getProjectForExport(
    projectId: string,
    userId: string,
  ): Promise<IExportableWritingData>;

  listProjectsForExport(
    userId: string,
    limit?: number,
  ): Promise<IWritingListItem[]>;
}
