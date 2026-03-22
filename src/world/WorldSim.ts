import { TileWorld } from './TileWorld';
import { generateTerrain } from '../terrain/TerrainGenerator';
import { ChunkRenderer } from '../terrain/ChunkRenderer';
import { WaterSim } from '../water/WaterSim';
import { WaterRenderer } from '../water/WaterRenderer';
import { AgentPool, AgentState } from '../agents/AgentPool';
import { AgentBrain } from '../agents/AgentBrain';
import { AgentRenderer } from '../agents/AgentRenderer';
import { tickNeeds } from '../agents/AgentNeeds';
import { AGENT_CONFIG, GRID_CONFIG } from '../config';
import { colIndex, tileIndex } from '../utils/TileUtils';
import * as THREE from 'three';

const { WIDTH, HEIGHT } = GRID_CONFIG;

/**
 * WorldSim — the top-level simulation manager.
 *
 * Owns all subsystems and orchestrates:
 *   1. Water CA tick (via WaterSim, at 10 Hz)
 *   2. Agent needs drain (every frame)
 *   3. Agent AI + movement (every frame)
 *   4. Rendering updates (ChunkRenderer dirty flush, AgentRenderer, WaterRenderer)
 *
 * Call update(deltaTime) each animation frame.
 */
export class WorldSim {
    readonly world: TileWorld;

    private readonly chunkRenderer: ChunkRenderer;
    private readonly waterSim: WaterSim;
    private readonly waterRenderer: WaterRenderer;
    readonly agents: AgentPool;
    private readonly agentBrain: AgentBrain;
    readonly agentRenderer: AgentRenderer;

    isPaused = false;
    timeScale = 1.0;

    // Statistics
    totalDeaths = 0;
    simulationTime = 0;

    constructor(scene: THREE.Scene) {
        this.world = new TileWorld();

        this.chunkRenderer  = new ChunkRenderer(scene);
        this.waterSim       = new WaterSim();
        this.waterRenderer  = new WaterRenderer(scene);
        this.agents         = new AgentPool();
        this.agentBrain     = new AgentBrain(AGENT_CONFIG.MAX_AGENTS);
        this.agentRenderer  = new AgentRenderer(scene, AGENT_CONFIG.MAX_AGENTS);
    }

    /**
     * Generate terrain and spawn initial agents.
     * Can be called again to reset the simulation.
     */
    reset(agentCount: number = AGENT_CONFIG.COUNT): void {
        // Fresh world
        const world = this.world;
        world.tileType.fill(0);
        world.solidHeight.fill(-1);
        world.waterLevel.fill(0);
        world.flags.fill(0);

        // Generate terrain
        generateTerrain(world);

        // Reset stats
        this.totalDeaths    = 0;
        this.simulationTime = 0;
        this.agents.count   = 0;

        // Flush initial render
        this.chunkRenderer.update(world);
        this.waterRenderer.update(world);

        // Spawn agents on random passable tiles
        const passable: Array<{ x: number; y: number }> = [];
        for (let y = 0; y < HEIGHT; y++) {
            for (let x = 0; x < WIDTH; x++) {
                if (world.isPassable(x, y) && world.getSolidHeight(x, y) >= 0) {
                    passable.push({ x, y });
                }
            }
        }

        // Shuffle and pick
        for (let i = passable.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [passable[i], passable[j]] = [passable[j], passable[i]];
        }

        const spawn = Math.min(agentCount, passable.length);
        for (let i = 0; i < spawn; i++) {
            this.agents.spawn(passable[i].x, passable[i].y);
        }
    }

    /** Called every animation frame */
    update(rawDeltaTime: number, selectedAgentIndex = -1, hoveredAgentIndex = -1): void {
        if (this.isPaused) return;

        // Cap deltaTime to prevent large jumps (e.g. after tab switch)
        const dt = Math.min(rawDeltaTime, 0.1) * this.timeScale;
        this.simulationTime += dt;

        // --- Water simulation ---
        const waterTicked = this.waterSim.update(this.world, dt);

        // --- Agent needs ---
        tickNeeds(this.agents, dt);

        // --- Agent AI + movement ---
        const dead = this.agentBrain.update(this.agents, this.world, dt);

        // Remove dead agents (iterate in reverse to preserve indices during swap-remove)
        for (let i = dead.length - 1; i >= 0; i--) {
            const idx = dead[i];
            // Only remove if still marked DEAD (index may have shifted if multiple deaths)
            if (idx < this.agents.count && this.agents.state[idx] === AgentState.DEAD) {
                this.agents.remove(idx);
                this.totalDeaths++;
            }
        }

        // --- Render updates ---
        this.chunkRenderer.update(this.world);    // Only processes dirty chunks

        if (waterTicked) {
            this.waterRenderer.update(this.world);
        }

        this.agentRenderer.update(this.agents, this.world, selectedAgentIndex, hoveredAgentIndex);
    }

    getStats() {
        return {
            agents:         this.agents.count,
            totalDeaths:    this.totalDeaths,
            simTime:        Math.floor(this.simulationTime),
            waterCoverage:  this.computeWaterCoverage(),
            foodTiles:      this.countFoodTiles(),
        };
    }

    private computeWaterCoverage(): number {
        let wet = 0;
        const wl = this.world.waterLevel;
        for (let i = 0; i < wl.length; i++) {
            if (wl[i] > 0.01) wet++;
        }
        return Math.round((wet / (WIDTH * HEIGHT)) * 100);
    }

    private countFoodTiles(): number {
        // Quick scan of top-layer tiles for FOOD type
        let count = 0;
        const sh = this.world.solidHeight;
        for (let y = 0; y < HEIGHT; y++) {
            for (let x = 0; x < WIDTH; x++) {
                const ci = colIndex(x, y);
                const h  = sh[ci];
                if (h >= 0 && this.world.tileType[tileIndex(x, y, h)] === 3 /* FOOD */) {
                    count++;
                }
            }
        }
        return count;
    }

    dispose(): void {
        this.chunkRenderer.dispose();
        this.waterRenderer.dispose();
        this.agentRenderer.dispose();
    }
}
