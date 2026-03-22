import { AgentPool } from './AgentPool';
import { AGENT_CONFIG } from '../config';

/**
 * AgentNeeds — drains hunger and thirst each frame.
 * Operates entirely on AgentPool typed arrays — tight loop, minimal overhead.
 */
export function tickNeeds(pool: AgentPool, deltaTime: number): void {
    const { HUNGER_DRAIN, THIRST_DRAIN } = AGENT_CONFIG;

    for (let i = 0; i < pool.count; i++) {
        pool.hunger[i] = Math.min(1, pool.hunger[i] + HUNGER_DRAIN * deltaTime);
        pool.thirst[i] = Math.min(1, pool.thirst[i] + THIRST_DRAIN * deltaTime);
    }
}
