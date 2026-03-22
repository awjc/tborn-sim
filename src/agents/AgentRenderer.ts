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
 *
 * Hover/selection outlines are handled by OutlinePass in the post-processing
 * chain. Two invisible proxy Meshes track the hovered/selected agent positions;
 * the caller passes them to the appropriate OutlinePass.selectedObjects.
 */
export class AgentRenderer {
    private readonly mesh:        THREE.InstancedMesh;
    private readonly dummy        = new THREE.Object3D();

    /** Invisible proxy meshes fed to OutlinePass for silhouette detection. */
    readonly hoverProxy:  THREE.Mesh;
    readonly selectProxy: THREE.Mesh;

    getMesh(): THREE.InstancedMesh { return this.mesh; }

    constructor(scene: THREE.Scene, maxAgents: number) {
        const mat = new THREE.MeshLambertMaterial();
        this.mesh = new THREE.InstancedMesh(AGENT_GEO, mat, maxAgents);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.castShadow = RENDER_CONFIG.SHADOW_ENABLED;
        this.mesh.count = 0;
        scene.add(this.mesh);

        // Proxy meshes: written to neither color nor depth in the main pass,
        // but OutlinePass overrides the material so it sees them for silhouettes.
        const proxyMat = new THREE.MeshBasicMaterial({
            colorWrite: false,
            depthWrite: false,
            depthTest:  false,
        });
        this.hoverProxy  = new THREE.Mesh(AGENT_GEO, proxyMat);
        this.selectProxy = new THREE.Mesh(AGENT_GEO, proxyMat.clone());
        this.hoverProxy.visible  = false;
        this.selectProxy.visible = false;
        scene.add(this.hoverProxy);
        scene.add(this.selectProxy);
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

        this.updateProxy(this.hoverProxy,  hoveredIndex,  pool, world);
        this.updateProxy(this.selectProxy, selectedIndex, pool, world);
    }

    private updateProxy(
        proxy: THREE.Mesh,
        idx: number,
        pool: AgentPool,
        world: TileWorld,
    ): void {
        if (idx < 0 || idx >= pool.count) {
            proxy.visible = false;
            return;
        }

        const tx = pool.posX[idx];
        const ty = pool.posY[idx];
        const sh = Math.max(0, world.getSolidHeight(Math.round(tx), Math.round(ty)));
        const wp = tileToWorld(tx, ty, sh);

        proxy.position.set(wp.x, wp.y + TILE_SIZE + HALF, wp.z);
        proxy.visible = true;
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
        (this.hoverProxy.material  as THREE.Material).dispose();
        (this.selectProxy.material as THREE.Material).dispose();
    }
}
