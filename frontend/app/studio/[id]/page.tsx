import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StudioRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/ai-studio/${id}`);
}
