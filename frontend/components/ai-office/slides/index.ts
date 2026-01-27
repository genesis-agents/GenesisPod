/**
 * Slides Engine - Components
 */

// Main components
export { SlidesTab } from './SlidesTab';
export { AgentTeamPanel } from './AgentTeamPanel';
export { ThemeSelector, SLIDE_THEMES } from './ThemeSelector';
export type { SlideThemeId } from './ThemeSelector';

// Rendering
export { SlideRenderer } from './SlideRenderer';

// Editor components
export { ConversationPanel, ToolCallCard } from './SlidesEditor';
export type { ToolCallItem } from './SlidesEditor';

// Preview components
export { PreviewPanel, ThumbnailCard } from './SlidesPreview';

// AI Edit components
export { AIEditDropdown } from './AIEditDropdown';
export {
  FixLayoutResultDisplay,
  PolishContentResultDisplay,
  FactCheckResultDisplay,
} from './AIEditDropdown';

// V5.0 Components
export { ThinkingPanel } from './ThinkingPanel';
export type { ThinkingEntry } from './ThinkingPanel';
export { CodePreview } from './CodePreview';

// Default export
export { SlidesTab as default } from './SlidesTab';
