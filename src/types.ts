export type Photo = {
  id: string; stem: string; jpegPath?: string; rawPath?: string; previewUrl: string; fullPreviewUrl?: string;
  width: number; height: number; capturedAt?: string; camera?: string; lens?: string;
  score: number; stars: number; sharpness: number; exposure: number; noise: number; framing: number;
  bookmarked: boolean; flag?: 'none'|'pick'|'reject'; note: string; importedAt: string;
}
export type ImportProgress = { phase: string; current: number; total: number; file?: string }
export type Library = { name: string; source: string; cacheDir?: string; photos: Photo[]; createdAt: string }
