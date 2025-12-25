import { SetMetadata } from "@nestjs/common";
import {
  CapabilityMetadata,
  CAPABILITY_METADATA_KEY,
} from "../interfaces/capability.interface";

/**
 * 能力装饰器 - 用于标记一个类为能力提供者
 */
export const Capability = (metadata: Omit<CapabilityMetadata, "enabled">) =>
  SetMetadata(CAPABILITY_METADATA_KEY, { ...metadata, enabled: true });
