/**
 * Central configuration for all simulation parameters.
 * Edit values here to tune the simulation without touching logic code.
 */

// ============================================================================
// GRID / WORLD
// ============================================================================

export const GRID_CONFIG = {
    WIDTH: 64,          // Tile columns (X axis)
    HEIGHT: 64,         // Tile rows    (Z axis in world space)
    LAYERS: 10,         // Vertical layers (Y axis)
    TILE_SIZE: 1.0,     // World units per tile edge
    CHUNK_SIZE: 16,     // Tiles per chunk side (must divide WIDTH/HEIGHT evenly)
} as const;

// ============================================================================
// TERRAIN GENERATION
// ============================================================================

export const TERRAIN_CONFIG = {
    NOISE_SCALE: 0.07,          // Simplex noise frequency — smaller = smoother
    ISLAND_FALLOFF: 1.4,        // Edge-falloff sharpness — higher = steeper shore
    BASE_HEIGHT: 1,             // Minimum solid layers at island centre
    MAX_HEIGHT: 8,              // Maximum solid layers (leaves 1 layer for water)
    WATER_SOURCE_COUNT: 4,      // River source tiles placed near high terrain
    WATER_SOURCE_FLOW: 0.15,    // Water volume injected per source per CA tick
    FOOD_TILE_FRACTION: 0.01,  // ~X% of surface tiles become food tiles at gen
} as const;

// ============================================================================
// WATER SIMULATION
// ============================================================================

export const WATER_CONFIG = {
    MAX_LEVEL: 1.0,         // Maximum water volume per column (in tile-height units)
    FLOW_RATE: 0.25,        // Fraction of head-difference transferred per CA tick
    EVAPORATION: 0.0002,    // Volume lost per column per CA tick (keeps pools stable)
    UPDATE_HZ: 10,          // CA ticks per second
    FLOOD_THRESHOLD: 0.3,   // Water level above which tile is impassable to agents
} as const;

// ============================================================================
// AGENTS
// ============================================================================

export const AGENT_CONFIG = {
    COUNT: 30,                  // Initial agent population
    MAX_AGENTS: 200,            // Pool capacity
    MOVE_SPEED: 2.5,            // Tiles per second (fractional movement)
    HUNGER_DRAIN: 0.03,         // Hunger increase per second (0–1 scale)
    THIRST_DRAIN: 0.025,        // Thirst increase per second
    HUNGER_SEEK_THRESHOLD: 0.55,  // Hunger level that triggers SEEK_FOOD
    THIRST_SEEK_THRESHOLD: 0.50,  // Thirst level that triggers SEEK_WATER
    HUNGER_SATISFIED: 0.15,     // Hunger level after eating
    THIRST_SATISFIED: 0.10,     // Thirst level after drinking
    EAT_DURATION: 0.6,          // Seconds spent eating at food tile
    DRINK_DURATION: 0.4,        // Seconds spent drinking at water tile
    WANDER_RETARGET_INTERVAL: 3.0,  // Seconds between wander retargets
    REPLAN_COOLDOWN: 0.5,       // Minimum seconds between A* replans
    DEATH_HUNGER: 1.0,          // Agent dies at this hunger level
    DEATH_THIRST: 1.0,          // Agent dies at this thirst level
    VISUAL_SIZE: 0.55,          // Agent cube half-size in world units
} as const;

// ============================================================================
// RENDERING
// ============================================================================

export const RENDER_CONFIG = {
    // Tile colours (CSS hex → parsed in renderers)
    COLOR_GROUND_LOW:  '#5a8a3c',   // Low-elevation grass
    COLOR_GROUND_MID:  '#4a7a2c',   // Mid-elevation grass
    COLOR_GROUND_HIGH: '#8a7a5c',   // High rock / cliff
    COLOR_CLIFF:       '#6b6050',   // Vertical cliff face
    COLOR_FOOD:        '#e8d44d',   // Food tile (golden)
    COLOR_WATER:       '#2a6aad',   // Water surface

    // Agent colours
    COLOR_AGENT_HEALTHY:  '#44aaff',
    COLOR_AGENT_HUNGRY:   '#ff6622',
    COLOR_AGENT_THIRSTY:  '#ffcc22',
    COLOR_AGENT_CRITICAL: '#ff2222',

    SHADOW_ENABLED: true,
    FOG_ENABLED: false,
} as const;

// ============================================================================
// UI
// ============================================================================

export const UI_CONFIG = {
    SPEED_MIN: 0.1,
    SPEED_MAX: 10.0,
    SPEED_DEFAULT: 1.0,
    STATS_UPDATE_HZ: 4,         // Stats panel refresh rate
} as const;
