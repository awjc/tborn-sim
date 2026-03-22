import { AGENT_CONFIG } from '../config';

const MAX = AGENT_CONFIG.MAX_AGENTS;

/**
 * AgentState values — stored as Uint8Array for cache efficiency
 */
export const AgentState = {
    WANDER:     0,
    SEEK_FOOD:  1,
    EAT:        2,
    SEEK_WATER: 3,
    DRINK:      4,
    DEAD:       5,
} as const;

export type AgentState = typeof AgentState[keyof typeof AgentState];

/**
 * AgentPool — struct-of-arrays storage for all agent hot data.
 *
 * Behaviour logic (AgentBrain) reads/writes these arrays directly.
 * Separating data from logic keeps the tight simulation loop fast.
 */
export class AgentPool {
    /** Count of active agents (agents 0..count-1 are valid) */
    count = 0;

    // --- Fractional tile-space position (smooth interpolation between tiles) ---
    readonly posX: Float32Array = new Float32Array(MAX);
    readonly posY: Float32Array = new Float32Array(MAX);

    // --- Current tile column (integer, for grid lookups) ---
    readonly tileX: Int16Array = new Int16Array(MAX);
    readonly tileY: Int16Array = new Int16Array(MAX);

    // --- Needs (0.0 = satisfied, 1.0 = critical) ---
    readonly hunger: Float32Array = new Float32Array(MAX);
    readonly thirst: Float32Array = new Float32Array(MAX);

    // --- AI state ---
    readonly state: Uint8Array = new Uint8Array(MAX);

    // --- Wander timer (seconds until next random retarget) ---
    readonly wanderTimer: Float32Array = new Float32Array(MAX);

    // --- Action timer (seconds remaining in EAT / DRINK action) ---
    readonly actionTimer: Float32Array = new Float32Array(MAX);

    // --- Movement interpolation ---
    /** Target fractional tile position for this movement step */
    readonly targetX: Float32Array = new Float32Array(MAX);
    readonly targetY: Float32Array = new Float32Array(MAX);

    /**
     * Spawn a new agent at tile position (tx, ty).
     * Returns the agent index, or -1 if the pool is full.
     */
    spawn(tx: number, ty: number): number {
        if (this.count >= MAX) return -1;

        const id = this.count++;
        this.posX[id]   = tx;
        this.posY[id]   = ty;
        this.tileX[id]  = tx;
        this.tileY[id]  = ty;
        this.targetX[id] = tx;
        this.targetY[id] = ty;
        this.hunger[id] = 0.2 + Math.random() * 0.3;  // Randomise starting hunger
        this.thirst[id] = 0.2 + Math.random() * 0.3;
        this.state[id]  = AgentState.WANDER;
        this.wanderTimer[id] = Math.random() * AGENT_CONFIG.WANDER_RETARGET_INTERVAL;
        this.actionTimer[id] = 0;
        return id;
    }

    /**
     * Remove agent by swapping with the last active agent.
     * This keeps the active range contiguous without gaps.
     */
    remove(id: number): void {
        if (id < 0 || id >= this.count) return;
        const last = this.count - 1;
        if (id !== last) {
            this.posX[id]        = this.posX[last];
            this.posY[id]        = this.posY[last];
            this.tileX[id]       = this.tileX[last];
            this.tileY[id]       = this.tileY[last];
            this.targetX[id]     = this.targetX[last];
            this.targetY[id]     = this.targetY[last];
            this.hunger[id]      = this.hunger[last];
            this.thirst[id]      = this.thirst[last];
            this.state[id]       = this.state[last];
            this.wanderTimer[id] = this.wanderTimer[last];
            this.actionTimer[id] = this.actionTimer[last];
        }
        this.count--;
    }
}
