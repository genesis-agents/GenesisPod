/**
 * Skills Management Components
 *
 * This module provides a 2-tab architecture for managing AI skills:
 * - Local Skills Tab: Manage locally installed skills
 * - Skills Marketplace Tab: Browse and install skills from SkillsMP
 */

export { LocalSkillsTab } from './LocalSkillsTab';
export { SkillsMarketplaceTab } from './SkillsMarketplaceTab';
export { SkillRow } from './SkillRow';
export { EditSkillModal } from './EditSkillModal';
export { SkillVersionHistory } from './SkillVersionHistory';
export { SKILL_LAYERS } from './skill-layers';
export type { SkillLayer } from './skill-layers';
export type { SkillConfig, MarketplaceSkill, SkillVersion } from './types';
