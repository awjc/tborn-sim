import * as THREE from 'three';
import { AgentPool } from './AgentPool';
import { TileWorld } from '../world/TileWorld';
import { AGENT_CONFIG, GRID_CONFIG, RENDER_CONFIG } from '../config';
import { parseColor, tileToWorld } from '../utils/TileUtils';

const { TILE_SIZE } = GRID_CONFIG;
const HALF = AGENT_CONFIG.VISUAL_SIZE;
const AGENT_GEO = new THREE.BoxGeometry(HALF * 2, HALF * 2, HALF * 2);

const COLOR_HEALTHY  = new THREE.Color(parseColor(RENDER_CONFIG.COLOR_AGENT_HEALTHY));
const COLOR_HUNGRY   = new THREE.Color(parseColor(RENDER_CONFIG.COLOR_AGENT_HUNGRY));
const COLOR_THIRSTY  = new THREE.Color(parseColor(RENDER_CONFIG.COLOR_AGENT_THIRSTY));
const COLOR_CRITICAL = new THREE.Color(parseColor(RENDER_CONFIG.COLOR_AGENT_CRITICAL));

/**
 * AgentRenderer — draws all agents as a single InstancedMesh.
 * One draw call regardless of agent count.
 * Color encodes the most urgent need.
 */
export class AgentRenderer {
    private readonly mesh: THREE.InstancedMesh;
    private readonly dummy = new THREE.Object3D();

    constructor(scene: THREE.Scene, maxAgents: number) {
        const mat = new THREE.MeshLambertMaterial();
        this.mesh = new THREE.InstancedMesh(AGENT_GEO, mat, maxAgents);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.castShadow = RENDER_CONFIG.SHADOW_ENABLED;
        this.mesh.count = 0;
        scene.add(this.mesh);
    }

    /** Called every frame to sync visual positions with agent data */
    update(pool: AgentPool, world: TileWorld): void {
        this.mesh.count = pool.count;

        for (let i = 0; i < pool.count; i++) {
            // Fractional tile position → world position
            const tx = pool.posX[i];
            const ty = pool.posY[i];

            // Use solid height at nearest integer tile for Y
            const itx = Math.round(tx);
            const ity = Math.round(ty);
            const sh  = Math.max(0, world.getSolidHeight(itx, ity));
            const wp  = tileToWorld(tx, ty, sh);

            this.dummy.position.set(wp.x, wp.y + TILE_SIZE + HALF, wp.z);
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);

            // Colour based on most urgent need
            const color = this.agentColor(pool, i);
            this.mesh.setColorAt(i, color);
        }

        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.mesh.instanceColor) {
            this.mesh.instanceColor.needsUpdate = true;
        }
    }

    private agentColor(pool: AgentPool, id: number): THREE.Color {
        const hunger = pool.hunger[id];
        const thirst = pool.thirst[id];
        const max = Math.max(hunger, thirst);

        if (max > 0.85) return COLOR_CRITICAL;
        if (thirst > hunger && thirst > 0.45) return COLOR_THIRSTY;
        if (hunger > 0.45) return COLOR_HUNGRY;
        return COLOR_HEALTHY;
    }

    dispose(): void {
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
    }
}
