import { API_BASE_URL } from "./constants";

export const fetchItems = async (): Promise<any[]> => {
  const response = await fetch(`${API_BASE_URL}/items`);
  return await response.json();
};
