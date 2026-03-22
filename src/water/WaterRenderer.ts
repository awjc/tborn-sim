import * as THREE from 'three';
import { TileWorld } from '../world/TileWorld';
import { GRID_CONFIG, RENDER_CONFIG } from '../config';
import { colIndex, parseColor, tileToWorld } from '../utils/TileUtils';

const { WIDTH, HEIGHT, TILE_SIZE } = GRID_CONFIG;

/**
 * WaterRenderer — one flat quad per wet tile via InstancedMesh.
 * Each tile is independent so no triangle ever spans a wet/dry boundary,
 * eliminating curtain artefacts and water bleeding through terrain sides.
 */
export class WaterRenderer {
    readonly mesh: THREE.InstancedMesh;
    private readonly dummy = new THREE.Object3D();

    constructor(scene: THREE.Scene) {
        const geo = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
        geo.rotateX(-Math.PI / 2);

        const mat = new THREE.MeshLambertMaterial({
            color: parseColor(RENDER_CONFIG.COLOR_WATER),
            transparent: true,
            opacity: 0.72,
            side: THREE.FrontSide,
        });

        this.mesh = new THREE.InstancedMesh(geo, mat, WIDTH * HEIGHT);
        this.mesh.count = 0;
        this.mesh.renderOrder = 1;
        scene.add(this.mesh);
    }

    update(world: TileWorld): void {
        const wl = world.waterLevel;
        const sh = world.solidHeight;
        let count = 0;

        for (let ty = 0; ty < HEIGHT; ty++) {
            for (let tx = 0; tx < WIDTH; tx++) {
                const ci = colIndex(tx, ty);
                const water = wl[ci];
                if (water <= 0.001) continue;

                const h = Math.max(0, sh[ci]);
                const wp = tileToWorld(tx, ty, h);

                // wp.y = h * TILE_SIZE (bottom of top block); terrain top face = (h+1) * TILE_SIZE
                this.dummy.position.set(wp.x, wp.y + TILE_SIZE + water * TILE_SIZE, wp.z);
                this.dummy.updateMatrix();
                this.mesh.setMatrixAt(count++, this.dummy.matrix);
            }
        }

        this.mesh.count = count;
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    dispose(): void {
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
    }
}
