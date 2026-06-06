import IndustryChainView from '@/components/industry-chain/IndustryChainView';

interface PageProps {
  params: { chainId: string };
}

export default function IndustryChainPage({ params }: PageProps) {
  return (
    <div className="h-screen">
      <IndustryChainView chainId={params.chainId} />
    </div>
  );
}
