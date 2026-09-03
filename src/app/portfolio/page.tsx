import { AuthError, requireUser } from '@/lib/auth/session';
import { loadPortfolio } from '@/components/portfolio/server';
import type { PortfolioData } from '@/components/portfolio/types';
import PortfolioAuthGate from '@/components/portfolio/auth-gate';
import PortfolioView from '@/components/portfolio/portfolio-view';

export const dynamic = 'force-dynamic';

/**
 * Investor portfolio. Server component: requireUser() gates the page, then
 * v_portfolio holdings, the caller's open listings and the transactions
 * ledger are loaded through the repositories and handed to the client view
 * (which owns the sell, update price, unlist and transfer dialogs).
 */
export default async function PortfolioPage() {
  let user;
  try {
    ({ user } = await requireUser());
  } catch (error) {
    if (error instanceof AuthError) {
      return <PortfolioAuthGate />;
    }
    throw error;
  }

  let data: PortfolioData = { holdings: [], transactions: [] };
  let loadFailed = false;
  try {
    data = await loadPortfolio(user);
  } catch (error) {
    console.error('[portfolio.page] load failed', error);
    loadFailed = true;
  }

  return <PortfolioView data={data} loadFailed={loadFailed} />;
}
