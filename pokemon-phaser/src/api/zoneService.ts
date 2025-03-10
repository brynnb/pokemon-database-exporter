import { API_BASE_URL } from "./constants";

export const fetchZoneInfo = async (zoneId: number): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/zone-info/${zoneId}`);
  return await response.json();
};

export const fetchOverworldZones = async (): Promise<any[]> => {
  const response = await fetch(`${API_BASE_URL}/overworld-zones`);
  return await response.json();
};
