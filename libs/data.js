export const GALLERY_ITEMS = Array.from({ length: 24 }).map((_, i) => ({
  id: `item-${i+1}`,
  title: `Species ${String(i+1).padStart(2,'0')}`,
  subtitle: `Short descriptor`,
  year: 18_00 + i,
  // поки без реальних картинок:
  image: null,
}));
