/**
 * Research Service Interface
 * 研究服务抽象接口 - 供 AI Engine 使用
 *
 * 解决问题: ResearcherAgent 不应直接依赖 AI Apps 的具体实现
 * 实现位置: backend/src/modules/ai-app/research/project/
 */

export interface IResearchService {
  /**
   * 创建研究项目
   */
  createProject(
    userId: string,
    title: string,
    description?: string,
  ): Promise<{
    id: string;
    title: string;
    description?: string;
  }>;

  /**
   * 保存研究输出
   */
  saveResearchOutput(
    userId: string,
    projectId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<{
    id: string;
    content: string;
  }>;

  /**
   * 搜索项目资源
   */
  searchProjectSources?(
    projectId: string,
    query: string,
  ): Promise<
    Array<{
      id: string;
      title: string;
      url?: string;
      snippet?: string;
    }>
  >;
}

/**
 * Injection Token for Research Service
 */
export const RESEARCH_SERVICE_TOKEN = Symbol("RESEARCH_SERVICE");
