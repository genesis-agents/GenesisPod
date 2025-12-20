// Services
export { DocumentsService } from "./documents.service";

// Controllers
export { DocumentsController } from "./documents.controller";

// DTOs & Types
export {
  CreateDocumentDto,
  UpdateDocumentDto,
  ListDocumentsQueryDto,
  CreateVersionDto,
  CompareVersionsDto,
  AddResourceRefDto,
  AddResourceRefsDto,
  AIConfigDto,
  OFFICE_DOCUMENT_TYPES,
  OFFICE_DOCUMENT_STATUSES,
  VERSION_TRIGGERS,
  RESOURCE_REF_TYPES,
} from "./documents.dto";
export type {
  OfficeDocumentType,
  OfficeDocumentStatus,
  VersionTrigger,
  ResourceRefType,
} from "./documents.dto";
