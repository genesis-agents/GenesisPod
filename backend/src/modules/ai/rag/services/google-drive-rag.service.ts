/**
 * Google Drive RAG Integration Service
 * Syncs Google Drive files to RAG knowledge bases
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { KnowledgeBaseService } from "./knowledge-base.service";
import { KnowledgeBaseStatus } from "@prisma/client";
import { google, drive_v3 } from "googleapis";
import { SyncResult, GoogleDriveFile } from "../interfaces/rag.interfaces";

// Supported MIME types for document processing
const SUPPORTED_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.google-apps.document": "google_doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/msword": "doc",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/html": "html",
  "application/vnd.google-apps.spreadsheet": "google_sheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

// Export MIME type mappings for Google Docs
const GOOGLE_EXPORT_MIME_TYPES: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

@Injectable()
export class GoogleDriveRAGService {
  private readonly logger = new Logger(GoogleDriveRAGService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  /**
   * Sync a knowledge base with Google Drive
   */
  async syncKnowledgeBase(knowledgeBaseId: string): Promise<SyncResult> {
    const result: SyncResult = {
      added: 0,
      updated: 0,
      deleted: 0,
      errors: [],
    };

    const kb = await this.prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      include: {
        googleDriveConnection: true,
        documents: {
          select: {
            id: true,
            sourceId: true,
          },
        },
      },
    });

    if (!kb) {
      throw new Error("Knowledge base not found");
    }

    if (!kb.googleDriveConnection) {
      throw new Error("Knowledge base is not connected to Google Drive");
    }

    const folderIds = (kb.googleDriveFolderIds as string[]) || [];
    if (folderIds.length === 0) {
      throw new Error("No Google Drive folders selected");
    }

    try {
      // Update status
      await this.prisma.knowledgeBase.update({
        where: { id: knowledgeBaseId },
        data: { status: KnowledgeBaseStatus.UPDATING },
      });

      // Get OAuth2 client
      const oauth2Client = await this.getOAuthClient(kb.googleDriveConnection);
      const drive = google.drive({ version: "v3", auth: oauth2Client });

      // Get all files from selected folders
      const allFiles: GoogleDriveFile[] = [];
      for (const folderId of folderIds) {
        const files = await this.listFilesInFolder(drive, folderId);
        allFiles.push(...files);
      }

      this.logger.log(
        `Found ${allFiles.length} files in Google Drive for KB ${knowledgeBaseId}`,
      );

      // Track existing document IDs
      const existingDocIds = new Map(
        kb.documents.map((d) => [d.sourceId, d.id]),
      );
      const processedSourceIds = new Set<string>();

      // Process each file
      for (const file of allFiles) {
        processedSourceIds.add(file.id);

        try {
          const existingDocId = existingDocIds.get(file.id);

          if (existingDocId) {
            // Check if file was modified
            const doc = await this.prisma.knowledgeBaseDocument.findUnique({
              where: { id: existingDocId },
            });

            if (doc) {
              const fileModified = file.modifiedTime
                ? new Date(file.modifiedTime)
                : new Date();
              const docProcessed = doc.processedAt || doc.createdAt;

              if (fileModified > docProcessed) {
                // File was modified, update it
                await this.updateDocumentFromFile(existingDocId, file, drive);
                result.updated++;
              }
            }
          } else {
            // New file, add it
            await this.addDocumentFromFile(
              knowledgeBaseId,
              kb.googleDriveConnection.id,
              file,
              drive,
            );
            result.added++;
          }
        } catch (error) {
          const errorMsg = `Failed to process file ${file.name}: ${error instanceof Error ? error.message : String(error)}`;
          this.logger.error(errorMsg);
          result.errors.push(errorMsg);
        }
      }

      // Remove documents for deleted files
      for (const [sourceId, docId] of existingDocIds) {
        if (!processedSourceIds.has(sourceId!)) {
          await this.prisma.knowledgeBaseDocument.delete({
            where: { id: docId },
          });
          result.deleted++;
        }
      }

      // Process all pending documents
      if (result.added > 0 || result.updated > 0) {
        await this.knowledgeBaseService.processAllDocuments(knowledgeBaseId);
      }

      // Update knowledge base status
      await this.prisma.knowledgeBase.update({
        where: { id: knowledgeBaseId },
        data: {
          status:
            result.errors.length > 0
              ? KnowledgeBaseStatus.ERROR
              : KnowledgeBaseStatus.READY,
          lastSyncedAt: new Date(),
          lastError: result.errors.length > 0 ? result.errors.join("\n") : null,
        },
      });

      this.logger.log(
        `Sync completed for KB ${knowledgeBaseId}: +${result.added}, ~${result.updated}, -${result.deleted}`,
      );

      return result;
    } catch (error) {
      await this.prisma.knowledgeBase.update({
        where: { id: knowledgeBaseId },
        data: {
          status: KnowledgeBaseStatus.ERROR,
          lastError: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  }

  /**
   * List all files in a Google Drive folder (recursively)
   */
  private async listFilesInFolder(
    drive: drive_v3.Drive,
    folderId: string,
    maxDepth: number = 3,
    currentDepth: number = 0,
  ): Promise<GoogleDriveFile[]> {
    const files: GoogleDriveFile[] = [];

    if (currentDepth >= maxDepth) {
      return files;
    }

    try {
      let pageToken: string | undefined;

      do {
        const response = await drive.files.list({
          q: `'${folderId}' in parents and trashed = false`,
          fields:
            "nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink)",
          pageSize: 100,
          pageToken,
        });

        const items = response.data.files || [];

        for (const item of items) {
          // Check if it's a folder
          if (item.mimeType === "application/vnd.google-apps.folder") {
            // Recursively get files from subfolder
            const subFiles = await this.listFilesInFolder(
              drive,
              item.id!,
              maxDepth,
              currentDepth + 1,
            );
            files.push(...subFiles);
          } else if (this.isSupportedMimeType(item.mimeType!)) {
            files.push({
              id: item.id!,
              name: item.name!,
              mimeType: item.mimeType!,
              size: item.size ? parseInt(item.size) : undefined,
              modifiedTime: item.modifiedTime || undefined,
              webViewLink: item.webViewLink || undefined,
            });
          }
        }

        pageToken = response.data.nextPageToken || undefined;
      } while (pageToken);
    } catch (error) {
      this.logger.error(`Failed to list files in folder ${folderId}:`, error);
    }

    return files;
  }

  /**
   * Add a new document from Google Drive file
   */
  private async addDocumentFromFile(
    knowledgeBaseId: string,
    connectionId: string,
    file: GoogleDriveFile,
    drive: drive_v3.Drive,
  ): Promise<void> {
    // Extract content from file
    const content = await this.extractFileContent(drive, file);

    if (!content || content.trim().length === 0) {
      throw new Error(`No content extracted from file: ${file.name}`);
    }

    // Add document to knowledge base
    await this.knowledgeBaseService.addDocument(knowledgeBaseId, {
      title: file.name,
      sourceType: "google_drive",
      sourceId: file.id,
      sourceUrl: file.webViewLink,
      mimeType: file.mimeType,
      content,
      metadata: {
        googleDriveFileId: file.id,
        connectionId,
        fileSize: file.size,
        modifiedTime: file.modifiedTime,
      },
    });

    this.logger.log(`Added document from Google Drive: ${file.name}`);
  }

  /**
   * Update an existing document from Google Drive file
   */
  private async updateDocumentFromFile(
    documentId: string,
    file: GoogleDriveFile,
    drive: drive_v3.Drive,
  ): Promise<void> {
    // Extract new content
    const content = await this.extractFileContent(drive, file);

    if (!content || content.trim().length === 0) {
      throw new Error(`No content extracted from file: ${file.name}`);
    }

    // Update document
    await this.prisma.knowledgeBaseDocument.update({
      where: { id: documentId },
      data: {
        title: file.name,
        rawContent: content,
        status: KnowledgeBaseStatus.PENDING,
        lastError: null,
        metadata: {
          googleDriveFileId: file.id,
          fileSize: file.size,
          modifiedTime: file.modifiedTime,
        },
      },
    });

    // Delete existing chunks
    await this.prisma.parentChunk.deleteMany({
      where: { documentId },
    });

    this.logger.log(`Updated document from Google Drive: ${file.name}`);
  }

  /**
   * Extract content from a Google Drive file
   */
  private async extractFileContent(
    drive: drive_v3.Drive,
    file: GoogleDriveFile,
  ): Promise<string> {
    // Handle Google Workspace documents (Docs, Sheets, etc.)
    if (file.mimeType.startsWith("application/vnd.google-apps.")) {
      return this.exportGoogleDoc(drive, file);
    }

    // Handle regular files
    return this.downloadFileContent(drive, file);
  }

  /**
   * Export Google Docs/Sheets to text
   */
  private async exportGoogleDoc(
    drive: drive_v3.Drive,
    file: GoogleDriveFile,
  ): Promise<string> {
    const exportMimeType = GOOGLE_EXPORT_MIME_TYPES[file.mimeType];

    if (!exportMimeType) {
      throw new Error(`Unsupported Google Workspace type: ${file.mimeType}`);
    }

    const response = await drive.files.export({
      fileId: file.id,
      mimeType: exportMimeType,
    });

    return response.data as string;
  }

  /**
   * Download and extract content from regular files
   */
  private async downloadFileContent(
    drive: drive_v3.Drive,
    file: GoogleDriveFile,
  ): Promise<string> {
    const response = await drive.files.get(
      {
        fileId: file.id,
        alt: "media",
      },
      { responseType: "arraybuffer" },
    );

    const buffer = Buffer.from(response.data as ArrayBuffer);

    // Handle different file types
    if (
      file.mimeType === "text/plain" ||
      file.mimeType === "text/markdown" ||
      file.mimeType === "text/html"
    ) {
      return buffer.toString("utf-8");
    }

    if (file.mimeType === "application/pdf") {
      return this.extractPdfContent(buffer);
    }

    if (
      file.mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.mimeType === "application/msword"
    ) {
      return this.extractDocxContent(buffer);
    }

    // Default: try to read as text
    return buffer.toString("utf-8");
  }

  /**
   * Extract text from PDF
   */
  private async extractPdfContent(buffer: Buffer): Promise<string> {
    // Use pdf-parse library if available
    try {
      const pdfParse = require("pdf-parse");
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      this.logger.warn("pdf-parse not available, returning empty string");
      return "";
    }
  }

  /**
   * Extract text from DOCX
   */
  private async extractDocxContent(buffer: Buffer): Promise<string> {
    // Use mammoth library if available
    try {
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      this.logger.warn("mammoth not available, returning empty string");
      return "";
    }
  }

  /**
   * Check if MIME type is supported
   */
  private isSupportedMimeType(mimeType: string): boolean {
    return mimeType in SUPPORTED_MIME_TYPES;
  }

  /**
   * Get OAuth2 client for Google Drive API
   */
  private async getOAuthClient(connection: any): Promise<any> {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_DRIVE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: connection.accessToken,
      refresh_token: connection.refreshToken,
    });

    // Check if token needs refresh
    if (new Date() > new Date(connection.tokenExpiry)) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();

        // Update stored tokens
        await this.prisma.googleDriveConnection.update({
          where: { id: connection.id },
          data: {
            accessToken: credentials.access_token!,
            tokenExpiry: new Date(credentials.expiry_date!),
          },
        });

        oauth2Client.setCredentials(credentials);
      } catch (error) {
        this.logger.error("Failed to refresh access token:", error);
        throw new Error("Google Drive authentication expired");
      }
    }

    return oauth2Client;
  }

  /**
   * List folders from Google Drive for folder selection UI
   */
  async listFolders(
    userId: string,
    parentFolderId?: string,
  ): Promise<Array<{ id: string; name: string; hasChildren: boolean }>> {
    const connection = await this.prisma.googleDriveConnection.findUnique({
      where: { userId },
    });

    if (!connection) {
      throw new Error("Google Drive not connected");
    }

    const oauth2Client = await this.getOAuthClient(connection);
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    const query = parentFolderId
      ? `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
      : `'root' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

    const response = await drive.files.list({
      q: query,
      fields: "files(id, name)",
      pageSize: 100,
      orderBy: "name",
    });

    const folders = response.data.files || [];

    // Check if each folder has children
    const foldersWithMeta = await Promise.all(
      folders.map(async (folder) => {
        const childResponse = await drive.files.list({
          q: `'${folder.id}' in parents and trashed = false`,
          fields: "files(id)",
          pageSize: 1,
        });

        return {
          id: folder.id!,
          name: folder.name!,
          hasChildren: (childResponse.data.files?.length || 0) > 0,
        };
      }),
    );

    return foldersWithMeta;
  }
}
