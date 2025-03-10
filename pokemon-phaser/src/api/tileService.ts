import { API_BASE_URL } from "./constants";

export interface TileImageCacheEntry {
  key: string;
  path: string;
}

export const getTileImageUrl = (tileId: number): string => {
  return `${API_BASE_URL}/tile-image/${tileId}`;
};

export const fetchTileImages = async (): Promise<any[]> => {
  const response = await fetch(`${API_BASE_URL}/tile-images`);
  return await response.json();
};

export const fetchTiles = async (zoneId: number): Promise<any[]> => {
  const response = await fetch(`${API_BASE_URL}/tiles/${zoneId}`);
  return await response.json();
};
