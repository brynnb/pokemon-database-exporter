import { API_BASE_URL } from "./constants";

export const fetchZoneInfo = async (zoneId: number): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/map-info/${zoneId}`);
  return await response.json();
};

export const fetchOverworldZones = async (): Promise<any[]> => {
  const response = await fetch(`${API_BASE_URL}/overworld-maps`);
  return await response.json();
};
