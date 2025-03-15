import {
  fetchItems,
  fetchNPCs,
  fetchOverworldMaps,
  fetchTileImages,
  fetchTiles,
  fetchWarps,
  fetchMapInfo,
} from "../api";

export class MapDataService {
  async fetchMapInfo(mapId: number) {
    return await fetchMapInfo(mapId);
  }

  async fetchTiles(mapId: number) {
    return await fetchTiles(mapId);
  }

  async fetchOverworldMaps() {
    return await fetchOverworldMaps();
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
