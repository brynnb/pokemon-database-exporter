import {
  fetchItems,
  fetchNPCs,
  fetchOverworldZones,
  fetchTileImages,
  fetchTiles,
  fetchWarps,
  fetchZoneInfo,
} from "../api";

export class MapDataService {
  async fetchZoneInfo(zoneId: number) {
    return await fetchZoneInfo(zoneId);
  }

  async fetchTiles(zoneId: number) {
    return await fetchTiles(zoneId);
  }

  async fetchOverworldZones() {
    return await fetchOverworldZones();
  }

  async fetchItems() {
    return await fetchItems();
  }

  async fetchNPCs() {
    return await fetchNPCs();
  }

  async fetchWarps() {
    return await fetchWarps();
  }

  async fetchTileImages() {
    return await fetchTileImages();
  }
}
