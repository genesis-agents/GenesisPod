import { redirect } from 'next/navigation';

/**
 * ai-studio 已重命名为 ai-research
 * 此页面提供向后兼容的重定向
 */
export default function AIStudioRedirect() {
  redirect('/ai-research');
}
