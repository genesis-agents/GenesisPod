export const TOOL_ID_ALIAS_TO_REGISTRY_ID: Record<string, string> = {
  tavily: "web-search",
  perplexity: "web-search",
  serper: "web-search",
  duckduckgo: "web-search",
  jina: "web-scraper",
  firecrawl: "web-scraper",
  tavilyExtract: "web-scraper",
  arxiv: "arxiv-search",
  "semantic-scholar": "semantic-scholar",
  pubmed: "pubmed",
  openalex: "openalex-search",
  hackernews: "hackernews-search",
  "github-search": "github-search",
  "industry-report": "industry-report-search",
  "federal-register": "federal-register",
  "congress-gov": "congress-gov",
  "whitehouse-news": "whitehouse-news",
  "alpha-vantage": "finance-api",
  "weather-api": "weather-api",
  elevenlabs: "audio-generation",
  googleTts: "audio-generation",
};

const REGISTRY_ID_TO_TOOL_ID_ALIASES = Object.entries(
  TOOL_ID_ALIAS_TO_REGISTRY_ID,
).reduce<Record<string, string[]>>((acc, [aliasId, registryId]) => {
  const aliases = acc[registryId] ?? [registryId];
  if (!aliases.includes(aliasId)) {
    aliases.push(aliasId);
  }
  acc[registryId] = aliases;
  return acc;
}, {});

export function getRegistryToolId(toolId: string): string {
  return TOOL_ID_ALIAS_TO_REGISTRY_ID[toolId] ?? toolId;
}

export function getToolIdAliases(toolId: string): string[] {
  const registryId = getRegistryToolId(toolId);
  const aliases = REGISTRY_ID_TO_TOOL_ID_ALIASES[registryId] ?? [registryId];

  if (toolId === registryId) {
    return aliases;
  }

  return [toolId, ...aliases.filter((id) => id !== toolId)];
}
