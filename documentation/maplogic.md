# Pokémon Red/Blue Map Parsing

_From: https://www.peterhajas.com/blog/pokemon_rb_map_parsing/_

A quick note: the pokered repository has changed since I wrote this post, and the graphics are now always in png format. As a result, you'll \*need to generate the 2bpp files yourself to follow these steps. Thankfully, running make in the pokered root will generate these using rgbgfx from the RGBDS project. Here's a sample invocation:

```
rgbgfx -o gfx/tilesets/overworld.2bpp gfx/tilesets/overworld.png
```

## Starting in Pallet Town

We'll use the game's starting area, Pallet Town, as an example. If you haven't played Pokémon Red and Blue, it looks like this:

_A screenshot of the player character in Pallet Town_
_This image was captured from an emulator running a compiled version of `pokered`_

In the pokered repository, individual city, route, and interior maps are stored in the `maps` directory as `.blk` files. Within the Pokémon map editing community these are known as "blockfiles".

Here's Pallet Town's blockfile in hex:

```
524F5252
4F0B5052
52504E01
38390101
3839014D
4E083C3D
01083C3D
014D4E01
01010101
0101014D
4E017756
010C0D0E
014D4E01
74740110
3A00014D
4E010101
01775677
314D4E0A
1D1E3174
740A314D
500A6564
61616161
614F
```

Somehow, these 90 bytes are what the game needs to render the starting town. But how?

Pallet Town measures 20 squares wide by 18 squares tall (where a "square" is the size of the player character). Surely there must be a 20x18-element grid that tells the game "blank space, left side of house, grass, water, etc.", right? But 20 x 18 = 360. If these 90 bytes were used to encode this information, that would mean we'd be allocating 4 "squares" of information per byte, which would only allow for 2 bits-per square. This would restrict us to 4 types of squares for the game. There are more types of tiles in Pokémon maps than 4 - you can see the variety used in Pallet Town above - so we'll have to look deeper.

## A Look at Tilesets

The pokered repository also contains a directory of tilesets, which is our first clue about how this system works. These are stored in `gfx/tilesets`. Each tileset is represented twice - a jpeg image and a 2bpp file. There are 19 of these tilesets for use cases like "house", "gym", "forest", and "overworld". Here's what overworld.jpeg looks like:

_A picture of the overworld tileset from Pokémon Red and Blue_

In the game, you move the player character around a grid of squares. These tilesets are not stored in squares. Notice that each 8x8 pixel tile measures exactly half the width and height of an in-game 16x16 pixel square. Here's a version of the tileset above where I've drawn dividers between the tiles:

_A picture of the overworld tileset from Pokémon Red and Blue with tile dividers_

For example, the infamous log (pillar? column?) that borders in-game areas is spread across 4 tiles. To save space and increase possibilities, each in-game square is made up of 4 tiles in a grid. This allows for creative combination of them to make more interesting maps.

The 2bpp file is what's actually compiled into the game. This represents our tileset image data, which is stored in "2 bits per pixel" format. This matches the color support of the original GameBoy which can only support 4 shades of gray. These are stored as 00 for white, 01 for light-gray, 10 for dark-gray, and 11 for black. These pixels are packed in 64 pixel tiles, and they are represented in a top-left coordinate system. This means the first pixel read is at (0, 0) at the top left of the tile, and the last pixel read is at (7, 7) at the bottom right of the tile.

Unusually, these tile pixels are spread across bytes. So these two bytes:

```
00000000 11111111
```

would not lead to pixels of `00 00 00 00 11 11 11 11`. Instead, you'd take each bit in the first byte and combine it with the bit at its same index in the next byte. This example would yield `01 01 01 01 01 01 01 01`. This is counter-intuitive but essential to parsing the tilesets.

Because it's in the overworld, Pallet Town uses the overworld tileset. You can find this information in Pallet Town's header file in `data/maps/headers/PalletTown.asm` which lists it as OVERWORLD:

```
map_header PalletTown, PALLET_TOWN, OVERWORLD, NORTH | SOUTH
```

## Blocksets to the Rescue

We still don't have nearly enough information to reconstitute a map. I got stuck here for a while. The bytes from the map blk files can't be offsets into the tileset - they're not big enough to store that data. There must be something else.

I grep'd around in the pokered repository looking for what could be missing. I found a file that held the key to understanding how these maps are stored - the blockset.

These blockset files live in the `gfx/blocksets` directory. Each tileset has its own blockset. For example, the overworld tileset has its own overworld.bst file in this directory. These are essential for properly parsing the map.

Because the GameBoy is so resource constrained, the game reduces common tile combinations into "blocksets" (also sometimes called "metatiles" in the map editing community). A blockset file contains "blocks" - 4x4 tile combinations that are used in-game. Each block contains 16 bytes, where each one is an offset into the tiles from the 2bpp tileset. These are also stored with a top-left coordinate system, and are stored contiguously - block-by-block - and referenced by index.

## Putting it Together

For me, figuring out blocksets was the missing link for understanding the end-to-end flow. We said earlier that our map, Pallet Town, measured 90 bytes despite being 20 squares wide by 18 squares tall. This is because map bytes are block references. So Pallet Town measures 10 blocks wide by 9 blocks tall. You can find these dimensions inside of the `constants/map_constants.asm` file, where they are represented as height, width for each map:

```
mapconst PALLET_TOWN, 9, 10 ; $00
```

Putting these parts together:

1. Find its tileset in its header (stored at `data/maps/headers/`)
2. Read the tileset in as a 2 bits per pixel format file. Pixels are spread across neighboring bytes. Tiles are stored as 8x8 pixels, and read in from top-left to bottom-right. A square is represented by 2x2 tiles
3. Read in the blockset, 16 bytes at a time. Each 16 byte unit is a block. These blocks measure 4x4 tiles - each byte is an index into the tileset read above. Blocksets are also read from top-left to bottom-right. Blocks measure 2x2 squares
4. Read in the map file. Each byte in the map file is an index into the blockset for the block to show at that location. Maps are also read from top-left to bottom-right

# Map Connections in Pokémon Red/Blue

Maps in Pokémon Red/Blue can connect to adjacent maps in four directions: north, south, east, and west. These connections are defined in each map's header file using the `connection` macro.

## Connection Definition

The connection macro takes four parameters:

1. **Direction**: north, south, east, or west
2. **Target Map Name**: the name of the map being connected to
3. **Target Map ID**: the constant ID of the map being connected to
4. **Offset**: the alignment offset between the two maps

For example, Pallet Town's header shows:

```
map_header PalletTown, PALLET_TOWN, OVERWORLD, NORTH | SOUTH
connection north, Route1, ROUTE_1, 0
connection south, Route21, ROUTE_21, 0
```

This indicates that Pallet Town connects to Route 1 to the north and Route 21 to the south, both with an offset of 0.

## The Offset Parameter

The offset parameter is crucial for understanding how maps align with each other:

- For **north/south** connections, the offset is an **x-axis offset** (horizontal shift)
- For **east/west** connections, the offset is a **y-axis offset** (vertical shift)

The offset value indicates how many blocks the target map is shifted relative to the current map. It's important to understand that this offset is measured in blocks, not tiles or pixels:

- 1 block = 2×2 squares (where a square is the size of the player character)
- 1 block = 4×4 tiles (where a tile is an 8×8 pixel unit)
- 1 block = 32×32 pixels total

A positive offset means the target map is shifted to the right (for north/south connections) or downward (for east/west connections) by that many blocks. A negative offset means the target map is shifted to the left or upward by that many blocks.

For example, Route 2's connections show:

```
connection north, PewterCity, PEWTER_CITY, -5
connection south, ViridianCity, VIRIDIAN_CITY, -5
```

This means that both Pewter City and Viridian City are shifted 5 blocks (160 pixels) to the left relative to Route 2 when connecting from the north and south respectively.

## Border Tiles and Rendering

The game uses a constant `MAP_BORDER` (defined as 3 in map_data_constants.asm) to handle the transition between maps. This creates a 3-tile border around each map for smooth transitions.

When the game renders a connection, it:

1. Calculates the appropriate block offsets for both the source and target maps
2. Determines which portion of the target map should be visible
3. Calculates the window position for rendering the connection
4. Determines the length of the connection (how many tiles wide/tall it should be)

The connection macro handles these calculations automatically based on the map dimensions and the provided offset.

## Connection Flags

In the map header, the connections are specified using bit flags:

```
map_header PalletTown, PALLET_TOWN, OVERWORLD, NORTH | SOUTH
```

The last parameter uses the bit flags NORTH, SOUTH, EAST, and WEST (defined in map_data_constants.asm) to indicate which directions have connections. These flags are combined using the bitwise OR operator (|).

The game uses these flags to determine which connections to load when entering a map. The flags correspond to the following bits:

- NORTH: 8
- SOUTH: 4
- WEST: 2
- EAST: 1

## Connection Implementation

When implementing a connection, the game:

1. Loads the appropriate blocks from the target map's blockset
2. Calculates the correct position in the overworld map buffer
3. Determines the visible portion of the connection
4. Sets up the window for rendering the connection

The connection macro in maps.asm handles all these calculations based on the direction, map dimensions, and offset value.

## Summary

Map connections in Pokémon Red/Blue use a single offset value that represents:

- An x-offset for north/south connections (horizontal alignment)
- A y-offset for east/west connections (vertical alignment)

The offset determines how the maps align with each other, with positive values shifting the target map right/down and negative values shifting it left/up. The game automatically handles the rendering of these connections based on the map dimensions and the specified offset.

This system allows the game to create a seamless world where players can travel between different areas without loading screens, creating the illusion of a continuous game world despite the technical limitations of the Game Boy hardware.
