/**
 * Finance API Connector
 *
 * P0: 实时数据源接入
 * 接入金融数据 API（Alpha Vantage / Yahoo Finance 替代）
 * 提供股票、公司、行业的实时和历史数据
 */

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  IDataSourceConnector,
  ConnectorSearchOptions,
  ConnectorHealthStatus,
} from "../../../types/data-source-connector.types";
import { DataSourceType, DataSourceResult } from "../../../types/data-source.types";

@Injectable()
export class FinanceApiConnector implements IDataSourceConnector {
  private readonly logger = new Logger(FinanceApiConnector.name);
  readonly sourceType = DataSourceType.FINANCE_API;
  readonly displayName = "Finance Data API";
  readonly requiresApiKey = true;

  private readonly apiKey?: string;
  private readonly baseUrl = "https://www.alphavantage.co/query";

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>("ALPHA_VANTAGE_API_KEY");
  }

  async search(
    query: string,
    maxResults: number,
    _options?: ConnectorSearchOptions,
  ): Promise<DataSourceResult[]> {
    this.logger.log(`[search] query="${query}", maxResults=${maxResults}`);

    if (!this.apiKey) {
      this.logger.warn("[search] No API key configured, skipping");
      return [];
    }

    try {
      // 搜索公司/股票符号
      const results = await this.searchSymbols(query, maxResults);
      return results;
    } catch (error) {
      this.logger.error(`[search] Failed: ${error}`);
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async healthCheck(): Promise<ConnectorHealthStatus> {
    if (!this.apiKey) {
      return {
        available: false,
        lastChecked: new Date(),
        error: "API key not configured",
      };
    }

    const start = Date.now();
    try {
      const params = new URLSearchParams({
        function: "SYMBOL_SEARCH",
        keywords: "AAPL",
        apikey: this.apiKey,
      });

      const response = await fetch(`${this.baseUrl}?${params.toString()}`, {
        signal: AbortSignal.timeout(5000),
      });

      return {
        available: response.ok,
        latencyMs: Date.now() - start,
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        available: false,
        latencyMs: Date.now() - start,
        lastChecked: new Date(),
        error: String(error),
      };
    }
  }

  private async searchSymbols(
    query: string,
    maxResults: number,
  ): Promise<DataSourceResult[]> {
    const params = new URLSearchParams({
      function: "SYMBOL_SEARCH",
      keywords: query,
      apikey: this.apiKey!,
    });

    const response = await fetch(`${this.baseUrl}?${params.toString()}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      this.logger.warn(`[searchSymbols] API returned ${response.status}`);
      return [];
    }

    const data = (await response.json()) as {
      bestMatches?: AlphaVantageMatch[];
    };

    if (!data.bestMatches) return [];

    return data.bestMatches.slice(0, maxResults).map((match) => ({
      sourceType: DataSourceType.FINANCE_API,
      title: `${match["2. name"]} (${match["1. symbol"]})`,
      url: `https://finance.yahoo.com/quote/${match["1. symbol"]}`,
      snippet: `${match["2. name"]} | ${match["3. type"]} | ${match["4. region"]} | Currency: ${match["8. currency"]}`,
      domain: "alphavantage.co",
      metadata: {
        symbol: match["1. symbol"],
        name: match["2. name"],
        type: match["3. type"],
        region: match["4. region"],
        currency: match["8. currency"],
        matchScore: match["9. matchScore"],
        sourceConnector: "finance-api",
      },
    }));
  }
}

interface AlphaVantageMatch {
  "1. symbol": string;
  "2. name": string;
  "3. type": string;
  "4. region": string;
  "8. currency": string;
  "9. matchScore": string;
}
