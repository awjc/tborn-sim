import { AgentPool, AgentState } from './AgentPool';
import { TileWorld } from '../world/TileWorld';
import { TileType } from '../world/TileTypes';
import { PathCache } from '../pathfinding/PathCache';
import { AGENT_CONFIG, GRID_CONFIG, WATER_CONFIG } from '../config';
import { colIndex, colX, colY, tileIndex } from '../utils/TileUtils';

const { WIDTH, HEIGHT } = GRID_CONFIG;

/**
 * AgentBrain — state machine for all agents.
 *
 * States:
 *   WANDER     → pick random passable tile nearby, walk there
 *   SEEK_FOOD  → A* to nearest FOOD tile
 *   EAT        → stand still, decrement action timer, consume food tile
 *   SEEK_WATER → A* to nearest flooded tile (waterLevel > threshold)
 *   DRINK      → stand still, decrement action timer, reduce thirst
 *   DEAD       → no-op (WorldSim removes dead agents)
 *
 * Movement is fractional: each tick the agent's posX/posY smoothly
 * interpolates toward the centre of the next tile in their path.
 */
export class AgentBrain {
    private readonly pathCache: PathCache;

    constructor(maxAgents: number) {
        this.pathCache = new PathCache(maxAgents);
    }

    /**
     * Update all agents for one simulation tick.
     * Returns array of agent indices that died this tick.
     */
    update(pool: AgentPool, world: TileWorld, deltaTime: number): number[] {
        this.pathCache.tick(deltaTime);
        const dead: number[] = [];

        for (let i = 0; i < pool.count; i++) {
            if (pool.state[i] === AgentState.DEAD) {
                dead.push(i);
                continue;
            }

            // Death check
            if (pool.hunger[i] >= AGENT_CONFIG.DEATH_HUNGER ||
                pool.thirst[i] >= AGENT_CONFIG.DEATH_THIRST) {
                pool.state[i] = AgentState.DEAD;
                dead.push(i);
                continue;
            }

            this.thinkAndMove(i, pool, world, deltaTime);
        }

        return dead;
    }

    private thinkAndMove(
        id: number,
        pool: AgentPool,
        world: TileWorld,
        dt: number
    ): void {
        // --- State transitions based on needs ---
        const state = pool.state[id];

        if (state !== AgentState.EAT && state !== AgentState.DRINK) {
            // Thirst is more urgent than hunger
            if (pool.thirst[id] >= AGENT_CONFIG.THIRST_SEEK_THRESHOLD) {
                if (state !== AgentState.SEEK_WATER) {
                    pool.state[id] = AgentState.SEEK_WATER;
                    this.pathCache.clearPath(id);
                }
            } else if (pool.hunger[id] >= AGENT_CONFIG.HUNGER_SEEK_THRESHOLD) {
                if (state !== AgentState.SEEK_FOOD) {
                    pool.state[id] = AgentState.SEEK_FOOD;
                    this.pathCache.clearPath(id);
                }
            } else if (state === AgentState.SEEK_FOOD || state === AgentState.SEEK_WATER) {
                // Needs satisfied — go back to wandering
                pool.state[id] = AgentState.WANDER;
                this.pathCache.clearPath(id);
            }
        }

        // --- Execute current state ---
        switch (pool.state[id]) {
            case AgentState.WANDER:     this.doWander(id, pool, world, dt);    break;
            case AgentState.SEEK_FOOD:  this.doSeekFood(id, pool, world, dt);  break;
            case AgentState.EAT:        this.doEat(id, pool, world, dt);       break;
            case AgentState.SEEK_WATER: this.doSeekWater(id, pool, world, dt); break;
            case AgentState.DRINK:      this.doDrink(id, pool, world, dt);     break;
        }

        // --- Apply fractional movement toward target tile ---
        this.moveTowardTarget(id, pool, dt);

        // --- Update integer tile position ---
        pool.tileX[id] = Math.round(pool.posX[id]);
        pool.tileY[id] = Math.round(pool.posY[id]);
    }

    // -------------------------------------------------------------------------
    // State handlers
    // -------------------------------------------------------------------------

    private doWander(id: number, pool: AgentPool, world: TileWorld, dt: number): void {
        pool.wanderTimer[id] -= dt;

        // Already moving toward a target — keep going
        if (this.isMoving(id, pool)) return;

        // Pick a new random target when timer expires or path is done
        if (pool.wanderTimer[id] <= 0) {
            pool.wanderTimer[id] = AGENT_CONFIG.WANDER_RETARGET_INTERVAL * (0.7 + Math.random() * 0.6);
            const goal = this.randomPassableNear(pool.tileX[id], pool.tileY[id], world, 8);
            if (goal !== null) {
                this.setNextStep(id, pool, world, goal);
            }
        }
    }

    private doSeekFood(id: number, pool: AgentPool, world: TileWorld, _dt: number): void {
        const tx = pool.tileX[id];
        const ty = pool.tileY[id];

        // Check if we're standing on food
        const sh = world.getSolidHeight(tx, ty);
        if (sh >= 0) {
            const topTile = world.tileType[tileIndex(tx, ty, sh)] as TileType;
            if (topTile === TileType.FOOD) {
                pool.state[id] = AgentState.EAT;
                pool.actionTimer[id] = AGENT_CONFIG.EAT_DURATION;
                return;
            }
        }

        // Pathfind to nearest food tile
        const goal = this.findNearestTileOfType(tx, ty, TileType.FOOD, world, 30);
        if (goal === null) {
            // No food in range — wander
            pool.state[id] = AgentState.WANDER;
            return;
        }

        const goalCol = colIndex(colX(goal), colY(goal));
        const startCol = colIndex(tx, ty);
        const path = this.pathCache.requestPath(id, startCol, goalCol, world);
        if (path && path.length > 0) {
            this.applyNextPathStep(id, pool, path);
        }
    }

    private doEat(id: number, pool: AgentPool, world: TileWorld, dt: number): void {
        pool.actionTimer[id] -= dt;
        if (pool.actionTimer[id] > 0) return;

        // Consume the food tile
        const tx = pool.tileX[id];
        const ty = pool.tileY[id];
        const sh = world.getSolidHeight(tx, ty);
        if (sh >= 0 && world.tileType[tileIndex(tx, ty, sh)] === TileType.FOOD) {
            world.setTile(tx, ty, sh, TileType.GROUND); // consume food → normal ground
        }

        pool.hunger[id] = AGENT_CONFIG.HUNGER_SATISFIED;
        pool.state[id] = AgentState.WANDER;
    }

    private doSeekWater(id: number, pool: AgentPool, world: TileWorld, _dt: number): void {
        const tx = pool.tileX[id];
        const ty = pool.tileY[id];

        // Check if we're adjacent to or on a water tile
        if (world.getWaterLevel(tx, ty) >= WATER_CONFIG.FLOOD_THRESHOLD * 0.5) {
            pool.state[id] = AgentState.DRINK;
            pool.actionTimer[id] = AGENT_CONFIG.DRINK_DURATION;
            return;
        }

        // Pathfind to nearest wet tile
        const goal = this.findNearestWetTile(tx, ty, world, 40);
        if (goal === null) {
            pool.state[id] = AgentState.WANDER;
            return;
        }

        const goalCol  = colIndex(colX(goal), colY(goal));
        const startCol = colIndex(tx, ty);
        const path = this.pathCache.requestPath(id, startCol, goalCol, world);
        if (path && path.length > 0) {
            this.applyNextPathStep(id, pool, path);
        }
    }

    private doDrink(id: number, pool: AgentPool, _world: TileWorld, dt: number): void {
        pool.actionTimer[id] -= dt;
        if (pool.actionTimer[id] > 0) return;

        pool.thirst[id] = AGENT_CONFIG.THIRST_SATISFIED;
        pool.state[id] = AgentState.WANDER;
    }

    // -------------------------------------------------------------------------
    // Movement helpers
    // -------------------------------------------------------------------------

    private moveTowardTarget(id: number, pool: AgentPool, dt: number): void {
        const dx = pool.targetX[id] - pool.posX[id];
        const dy = pool.targetY[id] - pool.posY[id];
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 0.01) {
            pool.posX[id] = pool.targetX[id];
            pool.posY[id] = pool.targetY[id];
            return;
        }

        const step = AGENT_CONFIG.MOVE_SPEED * dt;
        if (step >= dist) {
            pool.posX[id] = pool.targetX[id];
            pool.posY[id] = pool.targetY[id];
        } else {
            pool.posX[id] += (dx / dist) * step;
            pool.posY[id] += (dy / dist) * step;
        }
    }

    private isMoving(id: number, pool: AgentPool): boolean {
        const dx = pool.targetX[id] - pool.posX[id];
        const dy = pool.targetY[id] - pool.posY[id];
        return (dx * dx + dy * dy) > 0.01 * 0.01;
    }

    /** Set the next movement target for an agent directly to a tile */
    private setNextStep(
        id: number,
        pool: AgentPool,
        _world: TileWorld,
        goalCol: number
    ): void {
        const gx = colX(goalCol);
        const gy = colY(goalCol);
        pool.targetX[id] = gx;
        pool.targetY[id] = gy;
    }

    /** Extract next step from a path and set as movement target */
    private applyNextPathStep(id: number, pool: AgentPool, path: number[]): void {
        if (!this.isMoving(id, pool)) {
            const next = path.shift(); // consume step
            if (next !== undefined) {
                pool.targetX[id] = colX(next);
                pool.targetY[id] = colY(next);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Spatial search helpers
    // -------------------------------------------------------------------------

    /** Find nearest tile with a given type within scanRadius (BFS) */
    private findNearestTileOfType(
        sx: number, sy: number,
        type: TileType,
        world: TileWorld,
        scanRadius: number
    ): number | null {
        let bestCol: number | null = null;
        let bestDist = Infinity;

        const x0 = Math.max(0, sx - scanRadius);
        const x1 = Math.min(WIDTH  - 1, sx + scanRadius);
        const y0 = Math.max(0, sy - scanRadius);
        const y1 = Math.min(HEIGHT - 1, sy + scanRadius);

        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                if (!world.isPassable(x, y)) continue;
                const sh = world.getSolidHeight(x, y);
                if (sh < 0) continue;
                const tt = world.tileType[tileIndex(x, y, sh)] as TileType;
                if (tt !== type) continue;

                const dx = x - sx, dy = y - sy;
                const d = dx * dx + dy * dy;
                if (d < bestDist) { bestDist = d; bestCol = colIndex(x, y); }
            }
        }

        return bestCol;
    }

    /** Find nearest column with water > half the drink threshold */
    private findNearestWetTile(
        sx: number, sy: number,
        world: TileWorld,
        scanRadius: number
    ): number | null {
        const halfThreshold = WATER_CONFIG.FLOOD_THRESHOLD * 0.5;
        let bestCol: number | null = null;
        let bestDist = Infinity;

        const x0 = Math.max(0, sx - scanRadius);
        const x1 = Math.min(WIDTH  - 1, sx + scanRadius);
        const y0 = Math.max(0, sy - scanRadius);
        const y1 = Math.min(HEIGHT - 1, sy + scanRadius);

        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                if (world.getWaterLevel(x, y) < halfThreshold) continue;

                const dx = x - sx, dy = y - sy;
                const d = dx * dx + dy * dy;
                if (d < bestDist) { bestDist = d; bestCol = colIndex(x, y); }
            }
        }

        return bestCol;
    }

    /** Pick a random passable tile within `radius` of (sx, sy) */
    private randomPassableNear(
        sx: number, sy: number,
        world: TileWorld,
        radius: number
    ): number | null {
        // Collect candidates
        const candidates: number[] = [];
        const x0 = Math.max(0, sx - radius);
        const x1 = Math.min(WIDTH  - 1, sx + radius);
        const y0 = Math.max(0, sy - radius);
        const y1 = Math.min(HEIGHT - 1, sy + radius);

        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                if (world.isPassable(x, y)) {
                    candidates.push(colIndex(x, y));
                }
            }
        }

        if (candidates.length === 0) return null;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
}
