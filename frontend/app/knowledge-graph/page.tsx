import { redirect } from 'next/navigation';

export default function KnowledgeGraphRedirect({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  // 构建查询参数
  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value) {
      if (Array.isArray(value)) {
        value.forEach((v) => params.append(key, v));
      } else {
        params.append(key, value);
      }
    }
  });

  const queryString = params.toString();
  const targetUrl = `/library/knowledge-graph${queryString ? `?${queryString}` : ''}`;

  redirect(targetUrl);
}
