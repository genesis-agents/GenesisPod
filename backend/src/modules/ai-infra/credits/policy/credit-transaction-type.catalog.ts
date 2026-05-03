import { CreditTransactionType } from "@prisma/client";

export const CREDIT_TRANSACTION_TYPE_BY_MODULE: Record<
  string,
  CreditTransactionType
> = {
  "ai-ask": CreditTransactionType.AI_ASK,
  "ai-engine": CreditTransactionType.ADJUSTMENT,
  "ai-teams": CreditTransactionType.AI_TEAMS,
  "ai-planning": CreditTransactionType.AI_PLANNING,
  explore: CreditTransactionType.EXPLORE,
  "ai-office": CreditTransactionType.AI_OFFICE,
  "ai-simulation": CreditTransactionType.AI_SIMULATION,
  "ai-writing": CreditTransactionType.AI_WRITING,
  "ai-image": CreditTransactionType.AI_IMAGE,
  "ai-social": CreditTransactionType.AI_SOCIAL,
  "deep-research": CreditTransactionType.AI_RESEARCH,
  "topic-insights": CreditTransactionType.AI_INSIGHTS,
  "notebook-research": CreditTransactionType.NOTEBOOK_RESEARCH,
  library: CreditTransactionType.LIBRARY,
  notes: CreditTransactionType.NOTES,
  collections: CreditTransactionType.COLLECTIONS,
};
