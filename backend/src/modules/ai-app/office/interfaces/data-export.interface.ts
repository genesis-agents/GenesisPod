/**
 * AI Office - Data Export Interfaces (re-export shim)
 *
 * The canonical definition has moved to ai-app/contracts/interfaces/data-export.interface.ts
 * so that Research and Writing modules can reference these contracts without creating
 * a cross-App dependency on Office.
 *
 * This file re-exports everything for backward compatibility with Office-internal
 * consumers (e.g. ai-office.module.ts, data-import.service.ts).
 */

export * from "../../contracts/interfaces/data-export.interface";
