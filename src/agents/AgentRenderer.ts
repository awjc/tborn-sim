import * as THREE from 'three';
import { AgentPool } from './AgentPool';
import { TileWorld } from '../world/TileWorld';
import { AGENT_CONFIG, GRID_CONFIG, RENDER_CONFIG } from '../config';
import { parseColor, tileToWorld } from '../utils/TileUtils';

const { TILE_SIZE } = GRID_CONFIG;
const HALF = AGENT_CONFIG.VISUAL_SIZE;
const AGENT_GEO = new THREE.BoxGeometry(HALF * 2, HALF * 2, HALF * 2);

/** Scale factor for the outline shell — large enough to peek past the front faces */
const OUTLINE_SCALE = 1.18;

const COLOR_HEALTHY  = new THREE.Color(parseColor(RENDER_CONFIG.COLOR_AGENT_HEALTHY));
const COLOR_HUNGRY   = new THREE.Color(parseColor(RENDER_CONFIG.COLOR_AGENT_HUNGRY));
const COLOR_THIRSTY  = new THREE.Color(parseColor(RENDER_CONFIG.COLOR_AGENT_THIRSTY));
const COLOR_CRITICAL = new THREE.Color(parseColor(RENDER_CONFIG.COLOR_AGENT_CRITICAL));

/** Create a back-face-only outline InstancedMesh (max 1 instance) */
function makeOutlineMesh(scene: THREE.Scene, color: string): THREE.InstancedMesh {
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
    const mesh = new THREE.InstancedMesh(AGENT_GEO, mat, 1);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
}

/**
 * AgentRenderer — draws all agents as a single InstancedMesh.
 * One draw call regardless of agent count.
 * Color encodes the most urgent need.
 *
 * Hover/selection are shown as outline shells (back-face scaling trick):
 * a slightly larger back-face-only mesh rendered behind the real cube.
 */
export class AgentRenderer {
    private readonly mesh:         THREE.InstancedMesh;
    private readonly hoverOutline: THREE.InstancedMesh;
    private readonly selectOutline: THREE.InstancedMesh;
    private readonly dummy        = new THREE.Object3D();
    private readonly outlineDummy = new THREE.Object3D();

    getMesh(): THREE.InstancedMesh { return this.mesh; }

    constructor(scene: THREE.Scene, maxAgents: number) {
        const mat = new THREE.MeshLambertMaterial();
        this.mesh = new THREE.InstancedMesh(AGENT_GEO, mat, maxAgents);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.castShadow = RENDER_CONFIG.SHADOW_ENABLED;
        this.mesh.count = 0;
        scene.add(this.mesh);

        // Hover: blue outline; Select: white/gold outline
        this.hoverOutline  = makeOutlineMesh(scene, '#66bbff');
        this.selectOutline = makeOutlineMesh(scene, '#ffe566');
    }

    /** Called every frame to sync visual positions with agent data */
    update(pool: AgentPool, world: TileWorld, selectedIndex = -1, hoveredIndex = -1): void {
        this.mesh.count = pool.count;

        for (let i = 0; i < pool.count; i++) {
            const tx = pool.posX[i];
            const ty = pool.posY[i];
            const sh = Math.max(0, world.getSolidHeight(Math.round(tx), Math.round(ty)));
            const wp = tileToWorld(tx, ty, sh);

            this.dummy.position.set(wp.x, wp.y + TILE_SIZE + HALF, wp.z);
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);
            this.mesh.setColorAt(i, this.agentColor(pool, i));
        }

        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

        // Position outline shells (only active when index is valid)
        this.updateOutline(this.hoverOutline,   hoveredIndex,  pool, world);
        this.updateOutline(this.selectOutline,  selectedIndex, pool, world);
    }

    private updateOutline(
        outlineMesh: THREE.InstancedMesh,
        idx: number,
        pool: AgentPool,
        world: TileWorld,
    ): void {
        if (idx < 0 || idx >= pool.count) {
            outlineMesh.count = 0;
            return;
        }

        const tx = pool.posX[idx];
        const ty = pool.posY[idx];
        const sh = Math.max(0, world.getSolidHeight(Math.round(tx), Math.round(ty)));
        const wp = tileToWorld(tx, ty, sh);

        this.outlineDummy.position.set(wp.x, wp.y + TILE_SIZE + HALF, wp.z);
        this.outlineDummy.scale.setScalar(OUTLINE_SCALE);
        this.outlineDummy.updateMatrix();

        outlineMesh.count = 1;
        outlineMesh.setMatrixAt(0, this.outlineDummy.matrix);
        outlineMesh.instanceMatrix.needsUpdate = true;
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
        (this.hoverOutline.material  as THREE.Material).dispose();
        (this.selectOutline.material as THREE.Material).dispose();
    }
}
