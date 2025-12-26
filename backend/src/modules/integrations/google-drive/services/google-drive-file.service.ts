import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { google, drive_v3 } from "googleapis";
import { GoogleDriveAuthService } from "./google-drive-auth.service";
import { ListFilesDto } from "../dto/google-drive.dto";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  createdTime: string;
  modifiedTime: string;
  iconLink?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  parents?: string[];
  starred?: boolean;
  trashed?: boolean;
}

export interface ListFilesResult {
  files: DriveFile[];
  nextPageToken?: string;
}

@Injectable()
export class GoogleDriveFileService {
  private readonly logger = new Logger(GoogleDriveFileService.name);

  constructor(private readonly authService: GoogleDriveAuthService) {}

  /**
   * 列出文件
   */
  async listFiles(userId: string, options: ListFilesDto = {}): Promise<ListFilesResult> {
    const client = await this.authService.getAuthenticatedClient(userId);
    const drive = google.drive({ version: "v3", auth: client });

    try {
      // 构建查询条件
      const queryParts: string[] = ["trashed = false"];

      if (options.folderId) {
        queryParts.push(`'${options.folderId}' in parents`);
      } else if (!options.query) {
        // 如果没有提供 folderId 和自定义 query，则列出 root 目录
        queryParts.push("'root' in parents");
      }

      if (options.query) {
        queryParts.push(options.query);
      }

      const q = queryParts.join(" and ");

      const response = await drive.files.list({
        q,
        pageSize: options.pageSize || 20,
        pageToken: options.pageToken,
        orderBy: options.orderBy || "modifiedTime desc",
        fields:
          "nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, iconLink, thumbnailLink, webViewLink, webContentLink, parents, starred, trashed)",
      });

      const files: DriveFile[] = (response.data.files || []).map((file) => ({
        id: file.id!,
        name: file.name!,
        mimeType: file.mimeType!,
        size: file.size ? parseInt(file.size, 10) : undefined,
        createdTime: file.createdTime!,
        modifiedTime: file.modifiedTime!,
        iconLink: file.iconLink || undefined,
        thumbnailLink: file.thumbnailLink || undefined,
        webViewLink: file.webViewLink || undefined,
        webContentLink: file.webContentLink || undefined,
        parents: file.parents || undefined,
        starred: file.starred || false,
        trashed: file.trashed || false,
      }));

      return {
        files,
        nextPageToken: response.data.nextPageToken || undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to list files: ${error}`);
      throw new BadRequestException("Failed to list files from Google Drive");
    }
  }

  /**
   * 获取单个文件信息
   */
  async getFile(userId: string, fileId: string): Promise<DriveFile> {
    const client = await this.authService.getAuthenticatedClient(userId);
    const drive = google.drive({ version: "v3", auth: client });

    try {
      const response = await drive.files.get({
        fileId,
        fields:
          "id, name, mimeType, size, createdTime, modifiedTime, iconLink, thumbnailLink, webViewLink, webContentLink, parents, starred, trashed",
      });

      const file = response.data;
      return {
        id: file.id!,
        name: file.name!,
        mimeType: file.mimeType!,
        size: file.size ? parseInt(file.size, 10) : undefined,
        createdTime: file.createdTime!,
        modifiedTime: file.modifiedTime!,
        iconLink: file.iconLink || undefined,
        thumbnailLink: file.thumbnailLink || undefined,
        webViewLink: file.webViewLink || undefined,
        webContentLink: file.webContentLink || undefined,
        parents: file.parents || undefined,
        starred: file.starred || false,
        trashed: file.trashed || false,
      };
    } catch (error) {
      this.logger.error(`Failed to get file ${fileId}: ${error}`);
      throw new BadRequestException("Failed to get file from Google Drive");
    }
  }

  /**
   * 下载文件内容
   */
  async downloadFile(userId: string, fileId: string): Promise<Buffer> {
    const client = await this.authService.getAuthenticatedClient(userId);
    const drive = google.drive({ version: "v3", auth: client });

    try {
      // 首先获取文件元数据以确定 mimeType
      const metadata = await this.getFile(userId, fileId);

      // Google Workspace 文件需要导出
      const isGoogleWorkspaceFile = metadata.mimeType.startsWith("application/vnd.google-apps.");

      if (isGoogleWorkspaceFile) {
        return await this.exportGoogleWorkspaceFile(drive, fileId, metadata.mimeType);
      }

      // 普通文件直接下载
      const response = await drive.files.get(
        {
          fileId,
          alt: "media",
        },
        { responseType: "arraybuffer" },
      );

      return Buffer.from(response.data as ArrayBuffer);
    } catch (error) {
      this.logger.error(`Failed to download file ${fileId}: ${error}`);
      throw new BadRequestException("Failed to download file from Google Drive");
    }
  }

  /**
   * 导出 Google Workspace 文件
   */
  private async exportGoogleWorkspaceFile(
    drive: drive_v3.Drive,
    fileId: string,
    mimeType: string,
  ): Promise<Buffer> {
    // 根据 Google Workspace 文件类型选择导出格式
    let exportMimeType: string;

    if (mimeType === "application/vnd.google-apps.document") {
      exportMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"; // DOCX
    } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
      exportMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; // XLSX
    } else if (mimeType === "application/vnd.google-apps.presentation") {
      exportMimeType = "application/vnd.openxmlformats-officedocument.presentationml.presentation"; // PPTX
    } else if (mimeType === "application/vnd.google-apps.drawing") {
      exportMimeType = "application/pdf";
    } else {
      // 默认导出为 PDF
      exportMimeType = "application/pdf";
    }

    const response = await drive.files.export(
      {
        fileId,
        mimeType: exportMimeType,
      },
      { responseType: "arraybuffer" },
    );

    return Buffer.from(response.data as ArrayBuffer);
  }

  /**
   * 上传文件
   */
  async uploadFile(
    userId: string,
    folderId: string | undefined,
    fileName: string,
    content: Buffer,
    mimeType: string,
  ): Promise<DriveFile> {
    const client = await this.authService.getAuthenticatedClient(userId);
    const drive = google.drive({ version: "v3", auth: client });

    try {
      const fileMetadata: drive_v3.Schema$File = {
        name: fileName,
        parents: folderId ? [folderId] : undefined,
      };

      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: {
          mimeType,
          body: content,
        },
        fields: "id, name, mimeType, size, createdTime, modifiedTime, webViewLink",
      });

      const file = response.data;
      return {
        id: file.id!,
        name: file.name!,
        mimeType: file.mimeType!,
        size: file.size ? parseInt(file.size, 10) : undefined,
        createdTime: file.createdTime!,
        modifiedTime: file.modifiedTime!,
        webViewLink: file.webViewLink || undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error}`);
      throw new BadRequestException("Failed to upload file to Google Drive");
    }
  }

  /**
   * 创建文件夹
   */
  async createFolder(userId: string, parentId: string | undefined, name: string): Promise<DriveFile> {
    const client = await this.authService.getAuthenticatedClient(userId);
    const drive = google.drive({ version: "v3", auth: client });

    try {
      const fileMetadata: drive_v3.Schema$File = {
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: parentId ? [parentId] : undefined,
      };

      const response = await drive.files.create({
        requestBody: fileMetadata,
        fields: "id, name, mimeType, createdTime, modifiedTime, webViewLink",
      });

      const file = response.data;
      return {
        id: file.id!,
        name: file.name!,
        mimeType: file.mimeType!,
        createdTime: file.createdTime!,
        modifiedTime: file.modifiedTime!,
        webViewLink: file.webViewLink || undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to create folder: ${error}`);
      throw new BadRequestException("Failed to create folder in Google Drive");
    }
  }
}
