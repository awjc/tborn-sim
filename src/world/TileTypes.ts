/**
 * TileType values — every cell in the world grid is one of these.
 * Stored in a Uint8Array so values must fit in 0–255.
 */
export const TileType = {
    EMPTY:  0,
    GROUND: 1,
    CLIFF:  2,
    FOOD:   3,
} as const;

export type TileType = typeof TileType[keyof typeof TileType];

/** Human-readable labels for debugging */
export const TILE_NAMES: Record<number, string> = {
    [TileType.EMPTY]:  'empty',
    [TileType.GROUND]: 'ground',
    [TileType.CLIFF]:  'cliff',
    [TileType.FOOD]:   'food',
};
