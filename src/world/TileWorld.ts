import { GRID_CONFIG, WATER_CONFIG } from '../config';
import { TileType } from './TileTypes';
import { tileIndex, colIndex, inBounds } from '../utils/TileUtils';

const { WIDTH, HEIGHT, LAYERS } = GRID_CONFIG;
const TOTAL_TILES = WIDTH * HEIGHT * LAYERS;
const TOTAL_COLS  = WIDTH * HEIGHT;

/**
 * TileWorld — the core world state stored as flat typed arrays.
 *
 * All geometry and agent logic derive their data from these arrays.
 * Keeping them typed (Uint8Array, Float32Array) gives cache-friendly
 * sequential access and minimal GC overhead.
 */
export class TileWorld {
    // --- Tile grid (3-D: x, y, z) ---
    /** Tile type per 3-D cell */
    readonly tileType: Uint8Array;

    // --- Per-column data (2-D: x, y) ---
    /** Highest solid (non-EMPTY) layer index in each column; -1 if none */
    readonly solidHeight: Int8Array;
    /** Water volume in each column (0.0 – WATER_CONFIG.MAX_LEVEL) */
    readonly waterLevel: Float32Array;
    /** Bitmask flags: bit 0 = passable, bit 1 = is water source, bit 2 = is ocean sink */
    readonly flags: Uint8Array;

    // --- Dirty tracking ---
    /** Set of chunk indices that need visual rebuild */
    readonly dirtyChunks: Set<number> = new Set();

    constructor() {
        this.tileType    = new Uint8Array(TOTAL_TILES);
        this.solidHeight = new Int8Array(TOTAL_COLS).fill(-1);
        this.waterLevel  = new Float32Array(TOTAL_COLS);
        this.flags       = new Uint8Array(TOTAL_COLS);
    }

    // -------------------------------------------------------------------------
    // Tile accessors
    // -------------------------------------------------------------------------

    getTile(x: number, y: number, z: number): TileType {
        if (!inBounds(x, y, z)) return TileType.EMPTY;
        return this.tileType[tileIndex(x, y, z)] as TileType;
    }

    setTile(x: number, y: number, z: number, type: TileType): void {
        if (!inBounds(x, y, z)) return;
        this.tileType[tileIndex(x, y, z)] = type;
        this.rebuildSolidHeight(x, y);
        this.markChunkDirty(x, y);
    }

    // -------------------------------------------------------------------------
    // Column accessors
    // -------------------------------------------------------------------------

    getWaterLevel(x: number, y: number): number {
        return this.waterLevel[colIndex(x, y)];
    }

    setWaterLevel(x: number, y: number, level: number): void {
        const ci = colIndex(x, y);
        this.waterLevel[ci] = Math.max(0, Math.min(WATER_CONFIG.MAX_LEVEL, level));
    }

    getSolidHeight(x: number, y: number): number {
        return this.solidHeight[colIndex(x, y)];
    }

    /** Returns the world-space Y of the top solid surface (= solidHeight * TILE_SIZE) */
    getSurfaceY(x: number, y: number): number {
        return Math.max(0, this.solidHeight[colIndex(x, y)]) * GRID_CONFIG.TILE_SIZE;
    }

    isWaterSource(x: number, y: number): boolean {
        return (this.flags[colIndex(x, y)] & 0b010) !== 0;
    }

    isOceanSink(x: number, y: number): boolean {
        return (this.flags[colIndex(x, y)] & 0b100) !== 0;
    }

    setWaterSource(x: number, y: number, on: boolean): void {
        const ci = colIndex(x, y);
        if (on) this.flags[ci] |= 0b010;
        else    this.flags[ci] &= ~0b010;
    }

    setOceanSink(x: number, y: number, on: boolean): void {
        const ci = colIndex(x, y);
        if (on) this.flags[ci] |= 0b100;
        else    this.flags[ci] &= ~0b100;
    }

    /**
     * True if an agent can walk into this column.
     * Blocked when solid height < 0 (ocean/void) or water exceeds threshold.
     */
    isPassable(x: number, y: number): boolean {
        if (this.solidHeight[colIndex(x, y)] < 0) return false;
        return this.waterLevel[colIndex(x, y)] < WATER_CONFIG.FLOOD_THRESHOLD;
    }

    // -------------------------------------------------------------------------
    // Derived data
    // -------------------------------------------------------------------------

    /** Recompute solidHeight for a single column after tile changes */
    rebuildSolidHeight(x: number, y: number): void {
        let top = -1;
        for (let z = LAYERS - 1; z >= 0; z--) {
            if (this.tileType[tileIndex(x, y, z)] !== TileType.EMPTY) {
                top = z;
                break;
            }
        }
        this.solidHeight[colIndex(x, y)] = top;
    }

    /** Rebuild the entire solidHeight cache (called once after terrain generation) */
    rebuildAllSolidHeights(): void {
        for (let y = 0; y < HEIGHT; y++) {
            for (let x = 0; x < WIDTH; x++) {
                this.rebuildSolidHeight(x, y);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Chunk dirty tracking
    // -------------------------------------------------------------------------

    private markChunkDirty(tx: number, ty: number): void {
        const cs = GRID_CONFIG.CHUNK_SIZE;
        const cx = Math.floor(tx / cs);
        const cy = Math.floor(ty / cs);
        const chunksPerRow = Math.ceil(WIDTH / cs);
        this.dirtyChunks.add(cy * chunksPerRow + cx);
    }

    markAllChunksDirty(): void {
        const cs = GRID_CONFIG.CHUNK_SIZE;
        const cols = Math.ceil(WIDTH  / cs);
        const rows = Math.ceil(HEIGHT / cs);
        for (let i = 0; i < cols * rows; i++) {
            this.dirtyChunks.add(i);
        }
    }
}

// Re-export for convenience
export { GRID_CONFIG };
