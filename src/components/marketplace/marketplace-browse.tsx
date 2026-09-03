'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Container,
  Divider,
  InputAdornment,
  Menu,
  TextField,
  Typography,
} from '@mui/material';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import type { MarketplaceAssetRow } from '@/lib/db/assets';
import type { AssetCategoryRow } from '@/lib/db/categories';
import {
  matchesFilterBucket,
  metadataKeyForField,
  metadataValue,
  parseCategoryFields,
} from '@/components/investor/format';
import AssetCard from '@/components/marketplace/asset-card';

const PAGE_SIZE = 12;

type PriceSort = 'lowest' | 'highest' | null;

interface MarketplaceBrowseProps {
  assets: MarketplaceAssetRow[];
  categories: AssetCategoryRow[];
  initialCategorySlug: string | null;
  loadFailed: boolean;
}

export default function MarketplaceBrowse({
  assets,
  categories,
  initialCategorySlug,
  loadFailed,
}: MarketplaceBrowseProps) {
  const router = useRouter();

  const [categorySlug, setCategorySlug] = useState<string | null>(() =>
    categories.some((category) => category.slug === initialCategorySlug)
      ? initialCategorySlug
      : null,
  );
  const [search, setSearch] = useState('');
  const [priceSort, setPriceSort] = useState<PriceSort>(null);
  const [fieldFilters, setFieldFilters] = useState<Record<string, string>>({});
  const [displayedLength, setDisplayedLength] = useState(PAGE_SIZE);
  const [filterAnchor, setFilterAnchor] = useState<null | HTMLElement>(null);

  const activeCategory = useMemo(
    () => categories.find((category) => category.slug === categorySlug) ?? null,
    [categories, categorySlug],
  );
  const filterableFields = useMemo(() => {
    if (!activeCategory) {
      return [];
    }
    return parseCategoryFields(activeCategory.fields).filter(
      (field) =>
        (field.filterOptions && field.filterOptions.length > 0) ||
        (field.filter && field.options && field.options.length > 0),
    );
  }, [activeCategory]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = assets.filter((asset) => {
      if (categorySlug && asset.category_slug !== categorySlug) {
        return false;
      }
      if (query && !(asset.name ?? '').toLowerCase().includes(query)) {
        return false;
      }
      for (const [fieldName, bucket] of Object.entries(fieldFilters)) {
        const value = metadataValue(asset.metadata, metadataKeyForField(fieldName));
        if (!matchesFilterBucket(value, bucket)) {
          return false;
        }
      }
      return true;
    });

    if (priceSort) {
      const price = (asset: MarketplaceAssetRow) => {
        const raw = asset.floor_price_per_fraction ?? asset.mint_price_per_fraction;
        const parsed = raw === null ? Number.NaN : Number(raw);
        return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
      };
      rows.sort((a, b) =>
        priceSort === 'lowest' ? price(a) - price(b) : price(b) - price(a),
      );
    }
    return rows;
  }, [assets, categorySlug, search, priceSort, fieldFilters]);

  const selectCategory = (slug: string | null) => {
    setCategorySlug(slug);
    setFieldFilters({});
    setDisplayedLength(PAGE_SIZE);
    router.replace(slug ? `/marketplace?category=${encodeURIComponent(slug)}` : '/marketplace');
  };

  const toggleFieldFilter = (fieldName: string, option: string) => {
    setFieldFilters((current) => {
      const next = { ...current };
      if (next[fieldName] === option) {
        delete next[fieldName];
      } else {
        next[fieldName] = option;
      }
      return next;
    });
    setDisplayedLength(PAGE_SIZE);
  };

  return (
    <Box
      sx={{
        backgroundColor: 'marketplace.background',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Navbar />
      <Container sx={{ py: 3, flexGrow: 1 }}>
        <Box sx={{ textAlign: 'center', my: { xs: 1, sm: 3 } }}>
          <Typography
            style={{ fontWeight: 500 }}
            sx={{
              typography: { xs: 'h5', sm: 'h4', horizontalTablet: 'h3' },
              color: 'marketplace.categoryFilter.background',
            }}
          >
            The world&apos;s top assets, in one place
          </Typography>
          <Typography
            sx={{
              display: { xs: 'none', sm: 'block' },
              typography: { xs: 'subtitle1', verticalTablet: 'h6' },
              color: 'navbar.primary',
              py: 1,
            }}
          >
            Choose your next investment
          </Typography>
        </Box>

        {loadFailed && (
          <Alert severity="error" sx={{ mb: 3 }}>
            The marketplace could not be loaded. Please refresh the page to try again.
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search for assets"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setDisplayedLength(PAGE_SIZE);
            }}
            slotProps={{
              input: {
                endAdornment: search ? (
                  <InputAdornment position="end">
                    <Button
                      size="small"
                      onClick={() => setSearch('')}
                      sx={{ minWidth: 0, color: 'marketplace.filterButtonText' }}
                    >
                      Clear
                    </Button>
                  </InputAdornment>
                ) : undefined,
              },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'marketplace.searchInputBackground',
                color: 'navbar.primary',
              },
            }}
          />
          <Button
            onClick={(event) => setFilterAnchor(event.currentTarget)}
            sx={{
              color: 'marketplace.filterButtonText',
              border: 1,
              borderColor: 'border',
              borderRadius: 5,
              px: 2.5,
              py: 0.9,
              whiteSpace: 'nowrap',
              textTransform: 'none',
            }}
          >
            Filter
          </Button>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
          <Chip
            label="All"
            onClick={() => selectCategory(null)}
            sx={categoryChipSx(categorySlug === null)}
          />
          {categories.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              onClick={() => selectCategory(category.slug)}
              sx={categoryChipSx(categorySlug === category.slug)}
            />
          ))}
        </Box>

        <Menu
          anchorEl={filterAnchor}
          open={Boolean(filterAnchor)}
          onClose={() => setFilterAnchor(null)}
          sx={{
            '& .MuiMenu-paper': {
              backgroundColor: 'marketplace.filterMenuBackground',
              borderRadius: 2,
              mt: 1,
              width: { xs: '348px', horizontalTablet: '475px' },
              px: 1.5,
              py: 1,
            },
          }}
        >
          <Box>
            <Typography style={{ fontWeight: 500 }} sx={{ color: 'navbar.primary', fontSize: '18px' }}>
              Price
            </Typography>
            {(['lowest', 'highest'] as const).map((sort) => (
              <Box key={sort} sx={{ display: 'flex', alignItems: 'center' }}>
                <Checkbox
                  checked={priceSort === sort}
                  onChange={(event) => setPriceSort(event.target.checked ? sort : null)}
                  sx={{
                    color: '#BDBDBD',
                    '&.Mui-checked': { color: 'marketplace.categoryFilter.background' },
                  }}
                />
                <Typography variant="subtitle1" sx={{ color: 'navbar.primary' }}>
                  {sort === 'lowest' ? 'Lowest price first' : 'Highest price first'}
                </Typography>
              </Box>
            ))}
          </Box>
          {activeCategory === null && (
            <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText', px: 0.5, py: 1 }}>
              Pick a category above to filter by its attributes.
            </Typography>
          )}
          {filterableFields.map((field) => (
            <Box key={field.name} sx={{ mt: 1 }}>
              <Typography style={{ fontWeight: 500 }} sx={{ color: 'navbar.primary', fontSize: '18px' }}>
                {field.name}
              </Typography>
              {field.filterOptions && field.filterOptions.length > 0 ? (
                field.filterOptions.map((option) => (
                  <Box key={option} sx={{ display: 'flex', alignItems: 'center' }}>
                    <Checkbox
                      data-testid={`filter-option-${option}`}
                      checked={fieldFilters[field.name] === option}
                      onChange={() => toggleFieldFilter(field.name, option)}
                      sx={{
                        color: '#BDBDBD',
                        '&.Mui-checked': { color: 'marketplace.categoryFilter.background' },
                      }}
                    />
                    <Typography variant="subtitle1" sx={{ color: 'navbar.primary' }}>
                      {option}
                    </Typography>
                  </Box>
                ))
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
                  {(field.options ?? []).map((option) => (
                    <Chip
                      key={option}
                      label={option}
                      onClick={() => toggleFieldFilter(field.name, option)}
                      sx={categoryChipSx(fieldFilters[field.name] === option)}
                    />
                  ))}
                </Box>
              )}
            </Box>
          ))}
        </Menu>

        {!loadFailed && filtered.length === 0 ? (
          <Box sx={{ width: '100%', textAlign: 'center', mt: 8 }}>
            <Typography variant="h6" sx={{ color: 'navbar.primary' }}>
              No assets found
            </Typography>
            <Typography variant="body2" sx={{ color: 'marketplace.filterButtonText', mt: 1 }}>
              Try clearing the search or filters, or check back soon for new listings.
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              mt: { xs: 2, sm: 4 },
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'stretch',
              gap: { xs: 1, sm: 2.5 },
            }}
          >
            {filtered.slice(0, displayedLength).map((asset) => (
              <AssetCard key={asset.asset_id} asset={asset} />
            ))}
          </Box>
        )}

        {filtered.length > displayedLength && (
          <Box sx={{ mt: 7.5, mb: 6, display: 'flex', justifyContent: 'center' }}>
            <Button
              onClick={() => setDisplayedLength(displayedLength + PAGE_SIZE)}
              variant="contained"
              sx={{
                backgroundColor: 'marketplace.viewMoreButtonBackground',
                color: 'marketplace.searchButtonText',
                border: 1,
                borderColor: 'marketplace.searchButtonBorder',
                borderRadius: 5,
                py: 1,
                px: 3,
              }}
            >
              View More
            </Button>
          </Box>
        )}
      </Container>
      <Divider sx={{ backgroundColor: 'divider' }} />
      <Footer />
    </Box>
  );
}

function categoryChipSx(selected: boolean) {
  return {
    px: 1,
    backgroundColor: selected ? 'marketplace.categoryFilter.background' : 'navbar.background',
    color: selected ? 'marketplace.categoryFilter.text' : 'marketplace.filterButtonText',
    border: selected ? '' : 1,
    borderColor: selected ? '' : 'border',
    '&:hover': {
      backgroundColor: selected ? 'marketplace.categoryFilter.background' : 'navbar.background',
      color: selected ? 'marketplace.categoryFilter.text' : 'marketplace.filterButtonText',
    },
  } as const;
}
