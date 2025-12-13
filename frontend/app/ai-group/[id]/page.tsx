import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AIGroupRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/ai-teams/${id}`);
}
