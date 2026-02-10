// libs/data.js
export const GALLERY_ITEMS = Array.from({ length: 36 }, (_, i) => {
  const n = i + 1;
  return {
    id: `card-${n}`,
    title: `Картка ${n}`,
    subtitle: `Модуль / Епізод`,
    // пізніше можна додати image: "./assets/....jpg"
  };
});
