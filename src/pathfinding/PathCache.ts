import { TileWorld } from '../world/TileWorld';
import { AGENT_CONFIG } from '../config';
import { aStar } from './AStar';

/**
 * PathCache — per-agent path storage and invalidation.
 *
 * Each agent gets:
 *  - A path (array of column indices from current position toward goal)
 *  - A replan cooldown (prevents thrashing when A* can't find a path)
 *  - A goal column (to detect when a new plan is needed)
 */
export class PathCache {
    private readonly paths:        Array<number[] | null>;
    private readonly goals:        Int32Array;   // -1 = no goal
    private readonly cooldowns:    Float32Array; // seconds until next replan allowed
    private readonly maxAgents:    number;

    constructor(maxAgents: number) {
        this.maxAgents  = maxAgents;
        this.paths      = new Array(maxAgents).fill(null);
        this.goals      = new Int32Array(maxAgents).fill(-1);
        this.cooldowns  = new Float32Array(maxAgents);
    }

    /** Advance replan cooldowns */
    tick(deltaTime: number): void {
        for (let i = 0; i < this.maxAgents; i++) {
            if (this.cooldowns[i] > 0) {
                this.cooldowns[i] = Math.max(0, this.cooldowns[i] - deltaTime);
            }
        }
    }

    /**
     * Request a path for agent `id` from `startCol` to `goalCol`.
     * Returns the existing path if the goal hasn't changed and path is non-empty.
     * Replans with A* otherwise (subject to cooldown).
     */
    requestPath(
        id: number,
        startCol: number,
        goalCol: number,
        world: TileWorld
    ): number[] | null {
        // Return existing path if goal unchanged and steps remain
        if (this.goals[id] === goalCol && this.paths[id] && this.paths[id]!.length > 0) {
            return this.paths[id];
        }

        // Don't replan if on cooldown
        if (this.cooldowns[id] > 0) {
            return this.paths[id];
        }

        // Run A*
        const path = aStar(
            startCol,
            goalCol,
            world.solidHeight,
            (x, y) => world.isPassable(x, y)
        );

        this.paths[id]     = path;
        this.goals[id]     = goalCol;
        this.cooldowns[id] = AGENT_CONFIG.REPLAN_COOLDOWN;

        return path;
    }

    /** Consume the next step from an agent's path */
    popStep(id: number): number | null {
        const path = this.paths[id];
        if (!path || path.length === 0) return null;
        return path.shift()!; // remove first element (next tile to move to)
    }

    /** Peek at the next step without consuming it */
    peekStep(id: number): number | null {
        const path = this.paths[id];
        return (path && path.length > 0) ? path[0] : null;
    }

    /** Clear path for agent (e.g. when goal changes or agent dies) */
    clearPath(id: number): void {
        this.paths[id]  = null;
        this.goals[id]  = -1;
    }

    /** Invalidate paths for all agents whose path crosses a changed tile */
    invalidateNear(changedCol: number): void {
        for (let i = 0; i < this.maxAgents; i++) {
            const path = this.paths[i];
            if (!path) continue;
            if (path.includes(changedCol)) {
                this.clearPath(i);
            }
        }
    }

    hasPath(id: number): boolean {
        return this.paths[id] !== null && this.paths[id]!.length > 0;
    }
}
