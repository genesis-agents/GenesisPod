'use client';

import { redirect } from 'next/navigation';

/**
 * 秘钥管理页面重定向
 * 统一使用 /admin/access/secrets 页面（包含完整的健康状态监控功能）
 */
export default function SecretsPage() {
  redirect('/admin/access/secrets');
}
