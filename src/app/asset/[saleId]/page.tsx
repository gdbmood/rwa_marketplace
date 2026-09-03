import { getAssetDetail } from '@/actions/assets';
import { requireUser } from '@/lib/auth/session';
import { getApprovedKycForUser } from '@/lib/sumsub/kyc';
import { createServiceClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db/helpers';
import AssetDetailView, {
  type SellerName,
  type ViewerState,
} from '@/components/asset-detail/asset-detail-view';
import AssetNotFound from '@/components/asset-detail/asset-not-found';

export const dynamic = 'force-dynamic';

/**
 * Public asset detail. Server component: loads the v_marketplace row plus
 * active listings through the shared action, resolves seller display names
 * and the viewer's KYC state (mirrored client side; createBuyOrder enforces
 * it again server side), then renders the client view.
 */
interface AssetPageProps {
  params: Promise<{ saleId: string }>;
}

async function getViewerState(kycRequired: boolean): Promise<ViewerState> {
  try {
    const { user } = await requireUser();
    let kycApproved = user.is_verified;
    if (kycRequired && !kycApproved) {
      kycApproved = Boolean(await getApprovedKycForUser(user.id));
    }
    return { loggedIn: true, kycApproved };
  } catch {
    return { loggedIn: false, kycApproved: false };
  }
}

async function getSellerNames(listerIds: string[]): Promise<SellerName[]> {
  if (listerIds.length === 0) {
    return [];
  }
  const db = createServiceClient();
  const result = await db
    .from('users')
    .select('id, name, display_name')
    .in('id', listerIds);
  return unwrap(result, 'asset.getSellerNames');
}

export default async function AssetPage({ params }: AssetPageProps) {
  const { saleId } = await params;

  const detail = await getAssetDetail(saleId);
  if (!detail.ok) {
    return <AssetNotFound message={detail.error.message} code={detail.error.code} />;
  }

  const { asset, listings } = detail.data;
  const [viewer, sellers] = await Promise.all([
    getViewerState(Boolean(asset.kyc_required)),
    getSellerNames(Array.from(new Set(listings.map((listing) => listing.lister_id)))).catch(
      (error) => {
        console.error('[asset.page] seller name lookup failed', error);
        return [] as SellerName[];
      },
    ),
  ]);

  return (
    <AssetDetailView asset={asset} listings={listings} viewer={viewer} sellers={sellers} />
  );
}
