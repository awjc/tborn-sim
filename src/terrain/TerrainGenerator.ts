import { createNoise2D } from 'simplex-noise';
import { TileWorld } from '../world/TileWorld';
import { TileType } from '../world/TileTypes';
import { GRID_CONFIG, TERRAIN_CONFIG } from '../config';
import { tileIndex, colIndex, inBounds } from '../utils/TileUtils';

const { WIDTH, HEIGHT, LAYERS } = GRID_CONFIG;
const {
    NOISE_SCALE,
    ISLAND_FALLOFF,
    BASE_HEIGHT,
    MAX_HEIGHT,
    WATER_SOURCE_COUNT,
    WATER_SOURCE_FLOW: _sourceFlow,
    FOOD_TILE_FRACTION,
} = TERRAIN_CONFIG;

/**
 * Generates the island terrain using 2-D simplex noise modulated
 * by a radial island falloff, then places water sources and food tiles.
 */
export function generateTerrain(world: TileWorld): void {
    const noise2D = createNoise2D();

    // --- 1. Compute a height value (0–MAX_HEIGHT) for each column ---
    const heightMap = new Uint8Array(WIDTH * HEIGHT);

    const cx = WIDTH  / 2;
    const cy = HEIGHT / 2;
    const maxDist = Math.min(cx, cy);

    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            // Simplex value in [-1, 1] → [0, 1]
            const raw = (noise2D(x * NOISE_SCALE, y * NOISE_SCALE) + 1) / 2;

            // Radial island falloff — distance from centre normalised to [0, 1]
            const dx = (x - cx) / maxDist;
            const dy = (y - cy) / maxDist;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const falloff = Math.pow(Math.max(0, 1 - dist), ISLAND_FALLOFF);

            // Blend noise with falloff; clamp to valid layer range
            const h = Math.round((raw * falloff) * (MAX_HEIGHT - BASE_HEIGHT) + BASE_HEIGHT);
            heightMap[colIndex(x, y)] = Math.max(0, Math.min(LAYERS - 1, h));
        }
    }

    // --- 2. Fill solid tiles up to computed height ---
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            const h = heightMap[colIndex(x, y)];

            if (h === 0) {
                // Below sea level — leave as ocean sink
                world.setOceanSink(x, y, true);
                continue;
            }

            // Fill layers 0 → h-1 as GROUND
            for (let z = 0; z < h; z++) {
                if (inBounds(x, y, z)) {
                    world.tileType[tileIndex(x, y, z)] = TileType.GROUND;
                }
            }
        }
    }

    // --- 3. Add cliff faces on vertical transitions ---
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            const myH = heightMap[colIndex(x, y)];
            if (myH <= 0) continue;

            // Check 4 neighbours — if a neighbour is lower, this column has an exposed cliff face
            const neighbours = [
                { nx: x - 1, ny: y },
                { nx: x + 1, ny: y },
                { nx: x,     ny: y - 1 },
                { nx: x,     ny: y + 1 },
            ];

            for (const { nx, ny } of neighbours) {
                if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) continue;
                const nH = heightMap[colIndex(nx, ny)];
                // If neighbour is at least 1 layer shorter, the face between myH-1 and nH is a cliff
                for (let z = nH; z < myH - 1; z++) {
                    // Mark the tile at my position as CLIFF for that exposed layer
                    // (already set to GROUND, just override the type — renderers use it for colour)
                    if (inBounds(x, y, z)) {
                        world.tileType[tileIndex(x, y, z)] = TileType.CLIFF;
                    }
                }
            }
        }
    }

    // --- 4. Rebuild all solid heights ---
    world.rebuildAllSolidHeights();

    // --- 5. Place water sources near high points ---
    placeWaterSources(world, heightMap);

    // --- 6. Scatter food tiles on the surface ---
    placeFoodTiles(world, heightMap);

    // Mark everything dirty for initial render
    world.markAllChunksDirty();
}

/** Place river source tiles at high-elevation positions spread around the map */
function placeWaterSources(world: TileWorld, heightMap: Uint8Array): void {
    // Collect candidate columns sorted by height descending
    const candidates: Array<{ x: number; y: number; h: number }> = [];
    for (let y = 2; y < HEIGHT - 2; y++) {
        for (let x = 2; x < WIDTH - 2; x++) {
            const h = heightMap[colIndex(x, y)];
            if (h >= TERRAIN_CONFIG.MAX_HEIGHT - 2) {
                candidates.push({ x, y, h });
            }
        }
    }
    candidates.sort((a, b) => b.h - a.h);

    // Pick sources spread apart by at least WIDTH/4 tiles
    const minSpread = WIDTH / 4;
    const sources: Array<{ x: number; y: number }> = [];

    for (const c of candidates) {
        if (sources.length >= WATER_SOURCE_COUNT) break;
        const tooClose = sources.some(s => {
            const dx = s.x - c.x;
            const dy = s.y - c.y;
            return Math.sqrt(dx * dx + dy * dy) < minSpread;
        });
        if (!tooClose) {
            world.setWaterSource(c.x, c.y, true);
            sources.push({ x: c.x, y: c.y });
        }
    }
}

/** Randomly scatter FOOD tiles on a fraction of surface ground tiles */
function placeFoodTiles(world: TileWorld, heightMap: Uint8Array): void {
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            const h = heightMap[colIndex(x, y)];
            if (h <= 0) continue;                     // ocean
            if (world.isWaterSource(x, y)) continue; // don't overwrite sources
            if (Math.random() > FOOD_TILE_FRACTION) continue;

            // Replace the top tile with FOOD
            const topZ = h - 1;
            if (inBounds(x, y, topZ)) {
                world.tileType[tileIndex(x, y, topZ)] = TileType.FOOD;
            }
        }
    }
}
