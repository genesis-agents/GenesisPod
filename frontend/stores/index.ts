// Core stores
export * from './core';

// AI Office stores - export everything to maintain compatibility
export * from './ai-office';

// AI Teams stores (existing modular structure)
export * from './ai-teams';

// AI Insights stores (formerly AI Research)
export * from './ai-insights';

// AI Writing stores
export * from './ai-writing';

// AI Social stores
export * from './ai-social';

// AI Image stores
export * from './ai-image';

// User stores
export * from './user';

// Legacy: aiOfficeStore (large file, kept at root for now)
// Note: Only export items that don't conflict with modular versions
export * from './aiOfficeStore';

// Legacy stores - only export unique items not in modular versions
// aiTeamsStore and topicInsightsStore are now fully replaced by ai-teams and ai-insights modules
// Uncomment below if you need legacy exports:
// export * from './aiTeamsStore';
// export * from './topicInsightsStore';
