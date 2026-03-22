import { TileWorld } from '../world/TileWorld';
import { GRID_CONFIG, WATER_CONFIG, TERRAIN_CONFIG } from '../config';
import { colIndex, neighbours4 } from '../utils/TileUtils';

const { WIDTH, HEIGHT } = GRID_CONFIG;
const { FLOW_RATE, EVAPORATION, MAX_LEVEL } = WATER_CONFIG;
const SOURCE_FLOW = TERRAIN_CONFIG.WATER_SOURCE_FLOW;

/**
 * WaterSim — cellular automaton water simulation.
 *
 * Each column stores a water level (0.0 – MAX_LEVEL).
 * Every tick:
 *   1. Source tiles inject a fixed amount of water.
 *   2. Water flows to lower-surface neighbours proportional to head difference.
 *   3. Ocean sink tiles drain to zero.
 *   4. Tiny evaporation loss stabilises ponds.
 *
 * Runs at WATER_CONFIG.UPDATE_HZ (default 10 Hz), not every frame.
 */
export class WaterSim {
    private accumulator = 0;
    private readonly tickInterval: number;

    // Scratch buffer for the new water levels — avoids updating in-place
    // which would cause order-dependent flow artifacts
    private readonly newLevels: Float32Array;

    constructor() {
        this.tickInterval = 1 / WATER_CONFIG.UPDATE_HZ;
        this.newLevels = new Float32Array(WIDTH * HEIGHT);
    }

    /**
     * Called every animation frame.
     * Accumulates time and fires CA ticks at the configured rate.
     * @returns true if at least one tick ran (signals WaterRenderer to update)
     */
    update(world: TileWorld, deltaTime: number): boolean {
        this.accumulator += deltaTime;
        let ticked = false;

        while (this.accumulator >= this.tickInterval) {
            this.tick(world);
            this.accumulator -= this.tickInterval;
            ticked = true;
        }

        return ticked;
    }

    private tick(world: TileWorld): void {
        const wl = world.waterLevel;
        const fl = world.flags;
        const nl = this.newLevels;

        // Copy current levels as starting point
        nl.set(wl);

        // --- 1. Sources inject water ---
        for (let y = 0; y < HEIGHT; y++) {
            for (let x = 0; x < WIDTH; x++) {
                const ci = colIndex(x, y);
                if ((fl[ci] & 0b010) !== 0) {
                    nl[ci] = Math.min(MAX_LEVEL, nl[ci] + SOURCE_FLOW);
                }
            }
        }

        // --- 2. Checkerboard flow to reduce directional bias ---
        // Pass A: even-parity columns
        this.flowPass(world, nl, 0);
        // Pass B: odd-parity columns
        this.flowPass(world, nl, 1);

        // --- 3. Ocean sinks drain instantly ---
        for (let y = 0; y < HEIGHT; y++) {
            for (let x = 0; x < WIDTH; x++) {
                const ci = colIndex(x, y);
                if ((fl[ci] & 0b100) !== 0) {
                    nl[ci] = 0;
                }
            }
        }

        // --- 4. Evaporation ---
        for (let i = 0; i < nl.length; i++) {
            if (nl[i] > 0) {
                nl[i] = Math.max(0, nl[i] - EVAPORATION);
            }
        }

        // --- 5. Copy back ---
        wl.set(nl);
    }

    /**
     * One directional flow pass.
     * @param parity 0 = even-indexed columns first, 1 = odd
     */
    private flowPass(world: TileWorld, nl: Float32Array, parity: number): void {
        const sh = world.solidHeight;

        for (let y = 0; y < HEIGHT; y++) {
            for (let x = 0; x < WIDTH; x++) {
                if ((x + y) % 2 !== parity) continue;

                const ci = colIndex(x, y);
                const myH    = sh[ci];
                const myWl   = nl[ci];

                if (myWl <= 0 || myH < 0) continue;

                const mySurface = myH + myWl;

                for (const { x: nx, y: ny } of neighbours4(x, y)) {
                    const nci = colIndex(nx, ny);
                    const nH  = sh[nci];

                    // Ocean tiles (nH < 0) act as an infinite-depth drain:
                    // water always flows in (surface = -∞), and the sink
                    // step drains them to zero each tick.
                    const nSurface = nH < 0 ? -999 : nH + nl[nci];

                    if (mySurface > nSurface + 0.001) {
                        const headDiff = mySurface - nSurface;
                        const transfer = Math.min(nl[ci], headDiff * FLOW_RATE);
                        nl[ci]  -= transfer;
                        if (nH >= 0) {
                            nl[nci] = Math.min(MAX_LEVEL, nl[nci] + transfer);
                        }
                        // Water flowing into ocean (nH < 0) is simply lost —
                        // the sink step would zero it anyway
                    }
                }
            }
        }
    }
}
