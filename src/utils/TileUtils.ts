import { GRID_CONFIG } from '../config';

const { WIDTH, HEIGHT, LAYERS } = GRID_CONFIG;

/**
 * All tile-coordinate arithmetic lives here.
 * Never compute index formulas inline in application code — use these helpers.
 */

/** Flat index for a 3-D tile position */
export function tileIndex(x: number, y: number, z: number): number {
    return z * (WIDTH * HEIGHT) + y * WIDTH + x;
}

/** X component from a flat index */
export function tileX(index: number): number {
    return index % WIDTH;
}

/** Y (row) component from a flat index */
export function tileY(index: number): number {
    return Math.floor(index / WIDTH) % HEIGHT;
}

/** Z (vertical layer) component from a flat index */
export function tileZ(index: number): number {
    return Math.floor(index / (WIDTH * HEIGHT));
}

/** Surface (2-D column) index — no Z component */
export function colIndex(x: number, y: number): number {
    return y * WIDTH + x;
}

/** Convert column index back to X */
export function colX(col: number): number {
    return col % WIDTH;
}

/** Convert column index back to Y */
export function colY(col: number): number {
    return Math.floor(col / WIDTH);
}

/** True if the tile coordinates are inside the grid */
export function inBounds(x: number, y: number, z: number = 0): boolean {
    return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT && z >= 0 && z < LAYERS;
}

/** True if the column coordinates are inside the grid */
export function colInBounds(x: number, y: number): boolean {
    return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
}

/** Tile-space position → world-space position (centre of tile top face) */
export function tileToWorld(
    tx: number, ty: number, tz: number
): { x: number; y: number; z: number } {
    const s = GRID_CONFIG.TILE_SIZE;
    // Grid is centred at world origin
    const ox = -(WIDTH  * s) / 2;
    const oz = -(HEIGHT * s) / 2;
    return {
        x: ox + (tx + 0.5) * s,
        y: tz * s,
        z: oz + (ty + 0.5) * s,
    };
}

/** World-space X/Z → nearest tile column (clamped to grid) */
export function worldToCol(wx: number, wz: number): { x: number; y: number } {
    const s = GRID_CONFIG.TILE_SIZE;
    const ox = -(WIDTH  * s) / 2;
    const oz = -(HEIGHT * s) / 2;
    const tx = Math.floor((wx - ox) / s);
    const ty = Math.floor((wz - oz) / s);
    return {
        x: Math.max(0, Math.min(WIDTH  - 1, tx)),
        y: Math.max(0, Math.min(HEIGHT - 1, ty)),
    };
}

/** 4-connected neighbours of a column (filters out-of-bounds) */
export function neighbours4(x: number, y: number): Array<{ x: number; y: number }> {
    const result: Array<{ x: number; y: number }> = [];
    if (x > 0)          result.push({ x: x - 1, y });
    if (x < WIDTH  - 1) result.push({ x: x + 1, y });
    if (y > 0)          result.push({ x, y: y - 1 });
    if (y < HEIGHT - 1) result.push({ x, y: y + 1 });
    return result;
}

/** Parse a CSS hex colour string ('#RRGGBB') to an integer for Three.js */
export function parseColor(hex: string): number {
    return parseInt(hex.replace('#', '').slice(0, 6), 16);
}
