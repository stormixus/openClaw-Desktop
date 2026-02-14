const modules = import.meta.glob('./hwatu/*.png', { eager: true, query: '?url', import: 'default' });

const cardImages: Record<string, string> = {};
for (const [path, url] of Object.entries(modules)) {
  const match = path.match(/\.\/hwatu\/(.+)\.png$/);
  if (match) cardImages[match[1]] = url as string;
}

export function getCardImageUrl(cardId: string): string | null {
  return cardImages[cardId] ?? null;
}
