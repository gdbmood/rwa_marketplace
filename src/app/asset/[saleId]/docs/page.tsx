import { getAssetDetail } from '@/actions/assets';
import { metadataDocumentGroups } from '@/components/investor/format';
import AssetDocsView from '@/components/asset-detail/asset-docs-view';
import AssetNotFound from '@/components/asset-detail/asset-not-found';

export const dynamic = 'force-dynamic';

/**
 * Ownership documents for an asset. Server component: reads the metadata
 * document groups (all of them, not just the first) and renders the list.
 */
interface AssetDocsPageProps {
  params: Promise<{ saleId: string }>;
}

export default async function AssetDocsPage({ params }: AssetDocsPageProps) {
  const { saleId } = await params;

  const detail = await getAssetDetail(saleId);
  if (!detail.ok) {
    return <AssetNotFound message={detail.error.message} code={detail.error.code} />;
  }

  const { asset } = detail.data;
  return (
    <AssetDocsView
      assetId={asset.asset_id ?? saleId}
      assetName={asset.name ?? 'Untitled asset'}
      groups={metadataDocumentGroups(asset.metadata)}
    />
  );
}
