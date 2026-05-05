/**
 * Storage abstractions barrel（v5.1 R0.5-E W2-A）
 *
 * 端口集合（按部署平台差异驱动 plugin 化）：
 *   - object-storage-backend.interface  对象存储（R2/S3/GCS/Azure Blob/local-fs/IPFS）
 *   - cache-backend.interface           （未来）键值缓存（Redis/Memcached/CF KV/DynamoDB）
 *   - database-backend.interface        （未来）特殊持久化场景（多 DB / KV-as-DB 等）
 */
export * from "./object-storage-backend.interface";
