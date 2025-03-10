import {
  fetchItems,
  fetchOverworldZones,
  fetchTileImages,
  fetchTiles,
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

  async fetchTileImages() {
    return await fetchTileImages();
  }
}
