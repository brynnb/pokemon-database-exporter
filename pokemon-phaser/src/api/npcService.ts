import { API_BASE_URL } from "./constants";

export async function fetchNPCs() {
  try {
    const response = await fetch(`${API_BASE_URL}/npcs`);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch NPCs: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching NPCs:", error);
    throw error;
  }
}
