'use client';

import { useParams } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { RoomChatPage } from '@/components/ai-ask/room/RoomChatPage';

export default function AskRoomDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  if (!id) return null;
  return (
    <AppShell>
      <RoomChatPage roomId={id} />
    </AppShell>
  );
}
