import * as THREE from 'three';
import { TileWorld } from '../world/TileWorld';
import { GRID_CONFIG, RENDER_CONFIG } from '../config';
import { colIndex, parseColor } from '../utils/TileUtils';

const { WIDTH, HEIGHT, TILE_SIZE } = GRID_CONFIG;

/**
 * WaterRenderer — a single PlaneGeometry whose vertices are displaced
 * vertically to match the computed water levels each tick.
 *
 * One draw call for all water, regardless of grid size.
 * Phase 2 upgrade path: swap the MeshLambertMaterial for a custom
 * ShaderMaterial reading a DataTexture for animated ripples.
 */
export class WaterRenderer {
    readonly mesh: THREE.Mesh;
    private readonly positions: THREE.BufferAttribute;
    private readonly totalWidth:  number;
    private readonly totalHeight: number;

    // PlaneGeometry is (WIDTH+1) × (HEIGHT+1) vertices
    private readonly vertsX: number;
    private readonly vertsY: number;

    constructor(scene: THREE.Scene) {
        this.totalWidth  = WIDTH  * TILE_SIZE;
        this.totalHeight = HEIGHT * TILE_SIZE;
        this.vertsX = WIDTH  + 1;
        this.vertsY = HEIGHT + 1;

        // PlaneGeometry lies in XZ; we rotate it to lie in XZ world plane
        const geo = new THREE.PlaneGeometry(
            this.totalWidth,
            this.totalHeight,
            WIDTH,
            HEIGHT
        );
        // Rotate so it lies flat (PlaneGeometry is in XY by default)
        geo.rotateX(-Math.PI / 2);

        // After rotation, positions are in XZ. We'll update Y per-vertex.
        this.positions = geo.attributes.position as THREE.BufferAttribute;
        this.positions.setUsage(THREE.DynamicDrawUsage);

        const mat = new THREE.MeshLambertMaterial({
            color: parseColor(RENDER_CONFIG.COLOR_WATER),
            transparent: true,
            opacity: 0.72,
            side: THREE.FrontSide,
        });

        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.renderOrder = 1; // render after terrain
        scene.add(this.mesh);
    }

    /**
     * Update vertex heights from the world's waterLevel array.
     * Called whenever WaterSim ticks (≤ 10 Hz).
     */
    update(world: TileWorld): void {
        const wl = world.waterLevel;
        const sh = world.solidHeight;
        const pos = this.positions;

        // PlaneGeometry vertices are ordered row-by-row (Y columns, then X rows)
        // After rotateX the mapping is: vertex i → pos[i] = (x, y, z)
        // Vertex layout: vertsX columns × vertsY rows, left-to-right, top-to-bottom
        // We map each interior vertex to the closest tile column and set Y = solidHeight + waterLevel

        for (let vy = 0; vy < this.vertsY; vy++) {
            for (let vx = 0; vx < this.vertsX; vx++) {
                const vi = vy * this.vertsX + vx;

                // Clamp vertex to nearest interior tile (border vertices get nearest edge tile)
                const tx = Math.min(Math.max(vx - 1, 0), WIDTH  - 1);
                const ty = Math.min(Math.max(vy - 1, 0), HEIGHT - 1);

                const ci  = colIndex(tx, ty);
                const h   = Math.max(0, sh[ci]);      // solid height (layers)
                const water = wl[ci];

                if (water > 0.001) {
                    // Position water surface just above the solid ground
                    pos.setY(vi, (h + water) * TILE_SIZE);
                } else {
                    // Hide dry vertices below terrain so they don't z-fight
                    pos.setY(vi, -10);
                }
            }
        }

        pos.needsUpdate = true;
        this.mesh.geometry.computeVertexNormals();
    }

    dispose(): void {
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
    }
}
