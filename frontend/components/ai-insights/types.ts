/**
 * Shared types for AI Research components
 */

// AI Edit operation types
export type AIEditOperation =
  | 'rewrite'
  | 'polish'
  | 'expand'
  | 'compress'
  | 'style';

// Text selection info
export interface TextSelection {
  text: string;
  startOffset: number;
  endOffset: number;
}

// Text selection with DOMRect for positioning (used by AIFloatingToolbar)
export interface TextSelectionWithRect extends TextSelection {
  rect: DOMRect;
}

// Style type for style operation
export type StyleType = 'academic' | 'business' | 'casual' | 'technical';

// AI edit operation request (with additional options)
export interface AIEditOperationRequest {
  operation: AIEditOperation;
  customInstruction?: string;
  styleType?: StyleType;
}
