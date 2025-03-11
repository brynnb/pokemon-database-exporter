import { API_BASE_URL } from "./constants";

export async function fetchWarps() {
  try {
    const response = await fetch(`${API_BASE_URL}/warps`);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch warps: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching warps:", error);
    throw error;
  }
}
