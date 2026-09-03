import { redirect } from 'next/navigation';
import { listCategories } from '@/lib/db/categories';

export const dynamic = 'force-dynamic';

/**
 * Legacy per-class route. The browse experience now lives on /marketplace
 * with a category filter, so this route resolves the class (legacy links used
 * the display name, newer ones the slug) and redirects.
 */
interface AssetClassPageProps {
  params: Promise<{ assetClass: string }>;
}

export default async function AssetClassPage({ params }: AssetClassPageProps) {
  const { assetClass } = await params;
  const requested = decodeURIComponent(assetClass).trim().toLowerCase();

  let slug: string | null = null;
  try {
    const categories = await listCategories();
    const match = categories.find(
      (category) =>
        category.slug.toLowerCase() === requested ||
        category.name.toLowerCase() === requested,
    );
    slug = match?.slug ?? null;
  } catch (error) {
    console.error('[marketplace.assetClass] category lookup failed', error);
  }

  redirect(slug ? `/marketplace?category=${encodeURIComponent(slug)}` : '/marketplace');
}
