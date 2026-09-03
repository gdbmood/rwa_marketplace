import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import { type Row, unwrap } from '@/lib/db/helpers';

export type AssetCategoryRow = Row<'asset_categories'>;

export async function listCategories(): Promise<AssetCategoryRow[]> {
  const db = createServiceClient();
  const result = await db
    .from('asset_categories')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });
  return unwrap(result, 'categories.listCategories');
}
