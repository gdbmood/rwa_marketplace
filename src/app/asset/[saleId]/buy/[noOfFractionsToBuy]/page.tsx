import { redirect } from 'next/navigation';
import { getAssetDetail } from '@/actions/assets';
import { requireUser } from '@/lib/auth/session';
import { getApprovedKycForUser } from '@/lib/db/kyc';
import type { ViewerState } from '@/components/asset-detail/asset-detail-view';
import AssetNotFound from '@/components/asset-detail/asset-not-found';
import BuyFlow from '@/components/buy/buy-flow';

export const dynamic = 'force-dynamic';

/**
 * Checkout for a fixed number of fractions. Server component: loads the
 * asset, mirrors the KYC gate (createBuyOrder re-checks it server side) and
 * hands over to the client buy flow (USDC, Swap and Card tabs).
 */
interface BuyPageProps {
  params: Promise<{ saleId: string; noOfFractionsToBuy: string }>;
}

async function getViewerState(kycRequired: boolean): Promise<ViewerState> {
  try {
    const { user } = await requireUser();
    let kycApproved = user.is_verified;
    if (kycRequired && !kycApproved) {
      kycApproved = Boolean(await getApprovedKycForUser(user.id));
    }
    return { loggedIn: true, kycApproved, isOwner: false };
  } catch {
    return { loggedIn: false, kycApproved: false, isOwner: false };
  }
}

export default async function BuyPage({ params }: BuyPageProps) {
  const { saleId, noOfFractionsToBuy } = await params;

  const quantity = Number.parseInt(noOfFractionsToBuy, 10);
  if (!Number.isInteger(quantity) || quantity < 1) {
    redirect(`/asset/${saleId}`);
  }

  const detail = await getAssetDetail(saleId);
  if (!detail.ok) {
    return <AssetNotFound message={detail.error.message} code={detail.error.code} />;
  }

  const { asset, listings } = detail.data;
  if (
    asset.status !== 'active' ||
    asset.asset_id === null ||
    asset.nft_id === null
  ) {
    redirect(`/asset/${asset.asset_id ?? saleId}`);
  }

  const viewer = await getViewerState(Boolean(asset.kyc_required));

  return (
    <BuyFlow asset={asset} listings={listings} quantity={quantity} viewer={viewer} />
  );
}
