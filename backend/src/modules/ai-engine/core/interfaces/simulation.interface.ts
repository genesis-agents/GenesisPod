/**
 * Simulation Service Interface
 * 推演服务抽象接口 - 供 AI Engine 使用
 *
 * 解决问题: SimulatorAgent 不应直接依赖 AI Apps 的具体实现
 * 实现位置: backend/src/modules/ai-app/simulation/
 */

export interface ISimulationService {
  /**
   * 创建推演场景
   */
  createScenario(
    userId: string,
    name: string,
    description: string,
    config?: Record<string, unknown>,
  ): Promise<{
    id: string;
    name: string;
    description: string;
  }>;

  /**
   * 执行推演轮次
   */
  executeSimulationRound?(
    scenarioId: string,
    roundNumber: number,
    actions: Array<{
      team: string;
      action: string;
      reasoning?: string;
    }>,
  ): Promise<{
    roundNumber: number;
    results: unknown;
  }>;

  /**
   * 获取推演结果
   */
  getSimulationResults?(scenarioId: string): Promise<{
    scenarioId: string;
    rounds: unknown[];
    summary?: string;
  }>;
}

/**
 * Injection Token for Simulation Service
 */
export const SIMULATION_SERVICE_TOKEN = Symbol("SIMULATION_SERVICE");
