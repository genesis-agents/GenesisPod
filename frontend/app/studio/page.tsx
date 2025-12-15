import { redirect } from 'next/navigation';

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

export default async function StudioRedirect({ searchParams }: Props) {
  const params = await searchParams;
  const queryString = params.tab ? `?tab=${params.tab}` : '';
  redirect(`/ai-studio${queryString}`);
}
