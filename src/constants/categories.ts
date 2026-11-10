export const ITEM_CATEGORIES = [
  'Electronics',
  'Documents & IDs',
  'Bags',
  'Clothing',
  'Keys',
  'Wallets',
  'Books',
  'Others',
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const DEFAULT_CATEGORY: ItemCategory = 'Others';

// Converts any saved value (including old reports with no category)
// into a valid category. Unknown or missing values become "Others".
export const normalizeCategory = (value: unknown): ItemCategory => {
  if (typeof value !== 'string') {
    return DEFAULT_CATEGORY;
  }

  const cleaned = value.trim().toLowerCase();

  const match = ITEM_CATEGORIES.find(
    (category) => category.toLowerCase() === cleaned
  );

  return match ?? DEFAULT_CATEGORY;
};