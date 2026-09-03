-- Seed asset categories from src/constants.ts (assetsTypesFields).
-- Idempotent: safe to run multiple times. Field schemas are stored as jsonb so the
-- frontend can render each listing form from the database.
--
-- Field object keys mirror constants.ts exactly:
--   name          text        field label / key
--   type          text        one of: string, textArea, dropdown, document, number, date
--   options       text[]      dropdown choices (dropdown only)
--   filter        boolean     dropdown is filterable (dropdown only)
--   filterOptions text[]      predefined filter buckets (string / number / date)
--   min, max      number      numeric or date bounds
--
-- Dynamic values from constants.ts that cannot be frozen into a literal are stored
-- as string sentinels the frontend must resolve at render time:
--   "currentYear"      = new Date().getFullYear()
--   "today"            = new Date()
--   "todayPlus10Years" = new Date() plus 10 years

insert into public.asset_categories (name, slug, fields) values
(
  'Crypto Mining Farm',
  'crypto-mining-farm',
  '[
    {"name": "Location", "type": "string", "filterOptions": ["USA", "Canada", "China", "Russia", "Iceland"]},
    {"name": "Hash Rate", "type": "number", "min": 1, "max": 100000, "filterOptions": ["0-1000", "1000-5000", "5000-10000", "10000-50000", "50000+"]},
    {"name": "Power Usage", "type": "number", "min": 1, "max": 10000, "filterOptions": ["0-100", "100-500", "500-1000", "1000-5000", "5000+"]},
    {"name": "Equipment Details", "type": "string"},
    {"name": "Ownership Rights", "type": "document"}
  ]'::jsonb
),
(
  'Falcons',
  'falcons',
  '[
    {"name": "Breed", "type": "string", "filterOptions": ["Saker", "Peregrine", "Gyrfalcon", "Lanner", "Merlin"]},
    {"name": "Age", "type": "number", "min": 1, "max": 10, "filterOptions": ["0-1", "1-3", "3-5", "5-7", "7+"]},
    {"name": "Training Records", "type": "document"}
  ]'::jsonb
),
(
  'Watches',
  'watches',
  '[
    {"name": "Brand", "type": "string", "filterOptions": ["Rolex", "Patek Philippe", "Audemars Piguet", "Omega", "Tag Heuer"]},
    {"name": "Model", "type": "string", "filterOptions": ["Submariner", "Nautilus", "Royal Oak", "Speedmaster", "Carrera"]},
    {"name": "Year", "type": "number", "min": 1900, "max": "currentYear", "filterOptions": ["1900-1950", "1950-2000", "2000-2010", "2010-2020", "2020+"]},
    {"name": "Condition", "type": "dropdown", "options": ["New", "Used"], "filter": true},
    {"name": "Ownership Rights", "type": "document"}
  ]'::jsonb
),
(
  'IP And Brands',
  'ip-and-brands',
  '[
    {"name": "IP Type", "type": "dropdown", "options": ["Trademark", "Patent", "Copyright"], "filter": true},
    {"name": "Ownership Proof", "type": "document"}
  ]'::jsonb
),
(
  'Camels',
  'camels',
  '[
    {"name": "Breed", "type": "string", "filterOptions": ["Arabian", "Bactrian", "Dromedary", "Wild"]},
    {"name": "Age", "type": "number", "min": 1, "max": 50, "filterOptions": ["0-5", "5-10", "10-20", "20-30", "30+"]},
    {"name": "Health Records", "type": "document"}
  ]'::jsonb
),
(
  'NFTs',
  'nfts',
  '[
    {"name": "Category", "type": "dropdown", "options": ["Art", "Collectibles", "Utility"], "filter": true},
    {"name": "Artist", "type": "string", "filterOptions": ["Beeple", "CryptoPunk", "Bored Ape"]},
    {"name": "Minting Details", "type": "string"},
    {"name": "Ownership Rights", "type": "document"}
  ]'::jsonb
),
(
  'Horses',
  'horses',
  '[
    {"name": "Horse Name", "type": "string"},
    {"name": "Breed", "type": "string", "filterOptions": ["Thoroughbred", "Arabian", "Quarter Horse", "Appaloosa", "Paint"]},
    {"name": "Age", "type": "number", "min": 1, "max": 20, "filterOptions": ["0-5", "5-10", "10-15", "15-20", "20+"]},
    {"name": "Racing History", "type": "string"},
    {"name": "Ownership Rights", "type": "document"}
  ]'::jsonb
),
(
  'Luxury Yachts',
  'luxury-yachts',
  '[
    {"name": "Model", "type": "string", "filterOptions": ["Sunseeker", "Azimut", "Princess", "Fairline", "Pershing"]},
    {"name": "Year", "type": "number", "min": 1900, "max": "currentYear", "filterOptions": ["1900-1950", "1950-2000", "2000-2010", "2010-2020", "2020+"]},
    {"name": "Length", "type": "number", "min": 5, "max": 150, "filterOptions": ["0-10", "10-20", "20-30", "30-50", "50+"]},
    {"name": "Engine Type", "type": "string"},
    {"name": "Maintenance Records", "type": "document"}
  ]'::jsonb
),
(
  'Diamonds',
  'diamonds',
  '[
    {"name": "Category", "type": "dropdown", "options": ["Diamond", "Other"], "filter": true},
    {"name": "Carat Weight", "type": "number", "min": 0.1, "max": 100.0, "filterOptions": ["0.1-0.5", "0.5-1.0", "1.0-2.0", "2.0-5.0", "5.0+"]},
    {"name": "Cut Quality", "type": "dropdown", "options": ["Excellent", "Very Good", "Good", "Fair", "Poor"], "filter": true},
    {"name": "Color Grade", "type": "dropdown", "options": ["D", "E", "F", "G", "H", "I", "J"], "filter": true},
    {"name": "Clarity", "type": "dropdown", "options": ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "I1"], "filter": true},
    {"name": "Ownership Rights", "type": "document"}
  ]'::jsonb
),
(
  'Private Jets',
  'private-jets',
  '[
    {"name": "Model", "type": "string", "filterOptions": ["Gulfstream", "Bombardier", "Cessna", "Embraer", "Dassault"]},
    {"name": "Year", "type": "number", "min": 1900, "max": "currentYear", "filterOptions": ["1900-1950", "1950-2000", "2000-2010", "2010-2020", "2020+"]},
    {"name": "Flight Hours", "type": "number", "min": 0, "max": 20000, "filterOptions": ["0-1000", "1000-5000", "5000-10000", "10000-15000", "15000+"]},
    {"name": "Maintenance Records", "type": "document"},
    {"name": "Ownership Proof", "type": "document"}
  ]'::jsonb
),
(
  'Real Estate Properties',
  'real-estate-properties',
  '[
    {"name": "Property Area", "type": "number", "min": 0, "filterOptions": ["0-100", "100-200", "200-500", "500-1000", "1000+"]},
    {"name": "City", "type": "string"},
    {"name": "Category", "type": "dropdown", "options": ["Residential", "Commercial", "Hospitality", "Retail", "Industrial", "Villa", "Other"], "filter": true},
    {"name": "Ownership Rights", "type": "document"}
  ]'::jsonb
),
(
  'Luxury Cars',
  'luxury-cars',
  '[
    {"name": "Year", "type": "number", "min": 1900, "max": "currentYear", "filterOptions": ["1900-1950", "1950-2000", "2000-2010", "2010-2020", "2020+"]},
    {"name": "Mileage", "type": "number", "min": 0, "max": 1000000, "filterOptions": ["0-10000", "10000-50000", "50000-100000", "100000-200000", "200000+"]},
    {"name": "Condition", "type": "dropdown", "options": ["New", "Used", "Vintage"], "filter": true},
    {"name": "Ownership Proof", "type": "document"}
  ]'::jsonb
),
(
  'Carbon Credits',
  'carbon-credits',
  '[
    {"name": "Credit Type", "type": "dropdown", "options": ["Forestry", "Renewable Energy", "Agriculture"], "filter": true},
    {"name": "Total Credits", "type": "number", "min": 0, "max": 1000000, "filterOptions": ["0-100", "100-500", "500-1000", "1000-5000", "5000+"]},
    {"name": "Credit Value", "type": "number", "min": 1, "max": 100, "filterOptions": ["1-10", "10-50", "50-100", "100-500", "500+"]},
    {"name": "Issuance Year", "type": "number", "min": 2000, "max": "currentYear", "filterOptions": ["2000-2005", "2005-2010", "2010-2015", "2015-2020", "2020+"]},
    {"name": "Issuer", "type": "string", "filterOptions": ["Gold Standard", "Verra", "Climate Action Reserve", "American Carbon Registry"]},
    {"name": "Ownership Proof", "type": "document"}
  ]'::jsonb
),
(
  'Recycle Oasis',
  'recycle-oasis',
  '[
    {"name": "Recycling Type", "type": "dropdown", "options": ["Plastic", "Metal", "E-Waste"], "filter": true},
    {"name": "Material Type", "type": "dropdown", "options": ["PET", "Aluminum", "Steel", "Gold"], "filter": true},
    {"name": "Weight", "type": "number", "min": 0, "max": 100000, "filterOptions": ["0-100", "100-500", "500-1000", "1000-5000", "5000+"]},
    {"name": "Carbon Offset", "type": "number", "min": 0, "max": 10000, "filterOptions": ["0-10", "10-50", "50-100", "100-500", "500+"]},
    {"name": "Recycling Certification", "type": "document"}
  ]'::jsonb
),
(
  'Crowdfunding',
  'crowdfunding',
  '[
    {"name": "Project Type", "type": "dropdown", "options": ["Real Estate", "Startups", "Renewable Energy"], "filter": true},
    {"name": "Funding Goal", "type": "number", "min": 1000, "max": 10000000, "filterOptions": ["1000-10000", "10000-50000", "50000-100000", "100000-500000", "500000+"]},
    {"name": "Investors Allowed", "type": "number", "min": 1, "max": 100000, "filterOptions": ["1-10", "10-50", "50-100", "100-500", "500+"]},
    {"name": "Project Timeline", "type": "date"},
    {"name": "ROI Expectation", "type": "number", "min": 0, "max": 100, "filterOptions": ["0-5", "5-10", "10-20", "20-50", "50+"]},
    {"name": "Ownership Proof", "type": "document"}
  ]'::jsonb
),
(
  'Financial Derivatives',
  'financial-derivatives',
  '[
    {"name": "Derivative Type", "type": "dropdown", "options": ["Options", "Futures", "Swaps"], "filter": true},
    {"name": "Underlying Asset", "type": "dropdown", "options": ["Stocks", "Bonds", "Commodities"], "filter": true},
    {"name": "Expiry Date", "type": "date", "min": "today", "max": "todayPlus10Years", "filterOptions": ["1 month", "3 months", "6 months", "1 year", "2 years"]},
    {"name": "Strike Price", "type": "number", "min": 0, "max": 1000000, "filterOptions": ["0-100", "100-500", "500-1000", "1000-5000", "5000+"]},
    {"name": "Leverage Ratio", "type": "number", "min": 1, "max": 10, "filterOptions": ["1-2", "2-3", "3-5", "5-7", "7+"]},
    {"name": "Current Value", "type": "number", "min": 0, "max": 1000000, "filterOptions": ["0-100", "100-500", "500-1000", "1000-5000", "5000+"]},
    {"name": "Margin Requirements", "type": "number", "min": 0, "max": 50, "filterOptions": ["0-5", "5-10", "10-20", "20-30", "30+"]},
    {"name": "Ownership Rights", "type": "document"}
  ]'::jsonb
)
on conflict (slug) do update set
  name = excluded.name,
  fields = excluded.fields;
