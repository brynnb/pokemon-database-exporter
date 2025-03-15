import { API_BASE_URL } from "./constants";

export const fetchMapInfo = async (mapId: number): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/map-info/${mapId}`);
  return await response.json();
};

export const fetchOverworldMaps = async (): Promise<any[]> => {
  const response = await fetch(`${API_BASE_URL}/overworld-maps`);
  return await response.json();
};
