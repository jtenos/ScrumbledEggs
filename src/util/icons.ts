// Player avatar icons. The app is serverless, so the available-icon list is read
// from the hand-maintained manifest /player-images.txt (one filename per line).
let cache: string[] | null = null;

export async function loadIconList(): Promise<string[]> {
  if (cache) return cache;
  const res = await fetch('/player-images.txt');
  const text = await res.text();
  cache = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return cache;
}

export function iconUrl(filename: string): string {
  return `/img/player-icons/${filename}`;
}
