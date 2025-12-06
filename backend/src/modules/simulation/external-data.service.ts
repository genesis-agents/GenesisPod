import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import axios, { AxiosRequestHeaders } from "axios";

interface ExternalProvider {
  id: string;
  name: string;
  description?: string;
  category?: string;
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  headers?: string;
}

@Injectable()
export class ExternalDataService {
  private readonly logger = new Logger(ExternalDataService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async loadProviders(): Promise<ExternalProvider[]> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: "external.providers" },
    });
    if (!setting) return [];
    try {
      const parsed = JSON.parse(setting.value);
      return Array.isArray(parsed) ? (parsed as ExternalProvider[]) : [];
    } catch {
      return [];
    }
  }

  /**
   * Fetch data from configured external provider.
   * If baseUrl is missing or disabled, return null with reason.
   */
  async getSnapshot(
    providers: string[] = ["market", "finance", "news", "regulation"],
  ) {
    const results = await Promise.all(
      providers.map((p) => this.fetchFromProvider(p)),
    );
    const snapshot: Record<string, any> = {};
    const evidence: any[] = [];

    results.forEach((res) => {
      snapshot[res.providerId] = res.ok ? res.data : { error: res.error };
      evidence.push({
        provider: res.providerId,
        endpoint: res.endpoint,
        ok: res.ok,
        error: res.error,
        timestamp: new Date().toISOString(),
      });
    });

    return { snapshot, evidence };
  }

  async fetchFromProvider(
    providerId: string,
    path?: string,
    query?: Record<string, any>,
  ): Promise<{
    ok: boolean;
    providerId: string;
    data?: any;
    error?: string;
    endpoint?: string;
  }> {
    const providers = await this.loadProviders();
    const provider = providers.find((p) => p.id === providerId);

    if (!provider) {
      return { ok: false, providerId, error: "provider_not_configured" };
    }
    if (!provider.enabled) {
      return { ok: false, providerId, error: "provider_disabled" };
    }
    if (!provider.baseUrl) {
      return { ok: false, providerId, error: "missing_base_url" };
    }

    const endpoint =
      provider.baseUrl.replace(/\/+$/, "") +
      (path ? `/${path.replace(/^\/+/, "")}` : "");

    const headers: Record<string, any> = {};
    if (provider.apiKey) {
      headers.Authorization = `Bearer ${provider.apiKey}`;
    }
    if (provider.headers) {
      try {
        const parsed = JSON.parse(provider.headers);
        Object.assign(headers, parsed);
      } catch (err) {
        this.logger.warn(
          `Invalid headers JSON for provider ${providerId}: ${err}`,
        );
      }
    }

    try {
      const res = await axios.get(endpoint, {
        params: query,
        headers: headers as AxiosRequestHeaders,
        timeout: 15000,
      });
      return {
        ok: true,
        providerId,
        data: res.data,
        endpoint,
      };
    } catch (err: any) {
      this.logger.error(
        `External fetch failed [${providerId}] ${endpoint}: ${err?.message}`,
      );
      return {
        ok: false,
        providerId,
        error: err?.response?.status
          ? `HTTP_${err.response.status}`
          : err?.message || "fetch_failed",
        endpoint,
      };
    }
  }
}
