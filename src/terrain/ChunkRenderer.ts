import * as THREE from 'three';
import { TileWorld } from '../world/TileWorld';
import { TileType } from '../world/TileTypes';
import { GRID_CONFIG, RENDER_CONFIG, TERRAIN_CONFIG } from '../config';
import { tileIndex, tileToWorld, parseColor } from '../utils/TileUtils';

const { WIDTH, HEIGHT, LAYERS, TILE_SIZE, CHUNK_SIZE } = GRID_CONFIG;
const CHUNKS_X = Math.ceil(WIDTH  / CHUNK_SIZE);
const CHUNKS_Y = Math.ceil(HEIGHT / CHUNK_SIZE);
const TOTAL_CHUNKS = CHUNKS_X * CHUNKS_Y;

// Maximum instances per chunk per tile type
// A chunk has CHUNK_SIZE*CHUNK_SIZE columns, each up to LAYERS tiles tall
const MAX_INSTANCES_PER_CHUNK = CHUNK_SIZE * CHUNK_SIZE * LAYERS;

// Shared geometries — one box = one tile
const TILE_GEO = new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE, TILE_SIZE);

// Materials keyed by TileType
function makeMaterial(colorHex: number): THREE.MeshLambertMaterial {
    return new THREE.MeshLambertMaterial({ color: colorHex });
}

// Height-based ground colour: low → mid → high
function groundColor(z: number): number {
    const fraction = z / (TERRAIN_CONFIG.MAX_HEIGHT - 1);
    if (fraction < 0.33) return parseColor(RENDER_CONFIG.COLOR_GROUND_LOW);
    if (fraction < 0.66) return parseColor(RENDER_CONFIG.COLOR_GROUND_MID);
    return parseColor(RENDER_CONFIG.COLOR_GROUND_HIGH);
}

const CLIFF_COLOR = parseColor(RENDER_CONFIG.COLOR_CLIFF);
const FOOD_COLOR  = parseColor(RENDER_CONFIG.COLOR_FOOD);

/**
 * ChunkRenderer — manages one InstancedMesh per tile type per chunk.
 *
 * When a chunk is marked dirty, it scans its tiles and updates
 * the instance transformation matrices. Chunks that haven't changed
 * incur zero CPU cost per frame.
 */
export class ChunkRenderer {
    private scene: THREE.Scene;

    // meshes[chunkIndex][TileType] → InstancedMesh
    private meshes: Array<Map<TileType, THREE.InstancedMesh>> = [];

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.initMeshes();
    }

    private initMeshes(): void {
        for (let ci = 0; ci < TOTAL_CHUNKS; ci++) {
            const map = new Map<TileType, THREE.InstancedMesh>();

            // Ground mesh — uses vertex colours via the instance colour API
            const groundMesh = new THREE.InstancedMesh(
                TILE_GEO,
                new THREE.MeshLambertMaterial({ vertexColors: false }),
                MAX_INSTANCES_PER_CHUNK
            );
            groundMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            groundMesh.castShadow = false;
            groundMesh.receiveShadow = RENDER_CONFIG.SHADOW_ENABLED;
            groundMesh.count = 0;
            this.scene.add(groundMesh);
            map.set(TileType.GROUND, groundMesh);

            // Cliff mesh
            const cliffMesh = new THREE.InstancedMesh(
                TILE_GEO,
                makeMaterial(CLIFF_COLOR),
                MAX_INSTANCES_PER_CHUNK
            );
            cliffMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            cliffMesh.castShadow = false;
            cliffMesh.count = 0;
            this.scene.add(cliffMesh);
            map.set(TileType.CLIFF, cliffMesh);

            // Food mesh
            const foodMesh = new THREE.InstancedMesh(
                TILE_GEO,
                makeMaterial(FOOD_COLOR),
                MAX_INSTANCES_PER_CHUNK
            );
            foodMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            foodMesh.castShadow = false;
            foodMesh.count = 0;
            this.scene.add(foodMesh);
            map.set(TileType.FOOD, foodMesh);

            this.meshes.push(map);
        }
    }

    /**
     * Process all chunks flagged as dirty, rebuild their instance matrices,
     * then clear the dirty set.
     */
    update(world: TileWorld): void {
        if (world.dirtyChunks.size === 0) return;

        const dummy = new THREE.Object3D();
        const color  = new THREE.Color();

        for (const ci of world.dirtyChunks) {
            this.rebuildChunk(ci, world, dummy, color);
        }

        world.dirtyChunks.clear();
    }

    private rebuildChunk(
        ci: number,
        world: TileWorld,
        dummy: THREE.Object3D,
        color: THREE.Color
    ): void {
        const cx = ci % CHUNKS_X;
        const cy = Math.floor(ci / CHUNKS_X);
        const x0 = cx * CHUNK_SIZE;
        const y0 = cy * CHUNK_SIZE;
        const x1 = Math.min(x0 + CHUNK_SIZE, WIDTH);
        const y1 = Math.min(y0 + CHUNK_SIZE, HEIGHT);

        const map = this.meshes[ci];

        // Count arrays per tile type for index tracking
        const counts = new Map<TileType, number>([
            [TileType.GROUND, 0],
            [TileType.CLIFF,  0],
            [TileType.FOOD,   0],
        ]);

        for (let ty = y0; ty < y1; ty++) {
            for (let tx = x0; tx < x1; tx++) {
                for (let tz = 0; tz < LAYERS; tz++) {
                    const type = world.tileType[tileIndex(tx, ty, tz)] as TileType;
                    if (type === TileType.EMPTY) continue;

                    const mesh = map.get(type);
                    if (!mesh) continue;

                    const idx = counts.get(type)!;
                    counts.set(type, idx + 1);

                    const wp = tileToWorld(tx, ty, tz);
                    dummy.position.set(
                        wp.x,
                        wp.y + TILE_SIZE / 2, // centre of the box is half a tile up
                        wp.z
                    );
                    dummy.updateMatrix();
                    mesh.setMatrixAt(idx, dummy.matrix);

                    // Per-instance colour for ground tiles (height-based shading)
                    if (type === TileType.GROUND) {
                        color.setHex(groundColor(tz));
                        mesh.setColorAt(idx, color);
                    }
                }
            }
        }

        // Commit updated counts + flag matrices as needing upload
        for (const [type, mesh] of map) {
            mesh.count = counts.get(type) ?? 0;
            mesh.instanceMatrix.needsUpdate = true;
            if (type === TileType.GROUND && mesh.instanceColor) {
                mesh.instanceColor.needsUpdate = true;
            }
        }
    }

    dispose(): void {
        for (const map of this.meshes) {
            for (const mesh of map.values()) {
                this.scene.remove(mesh);
                mesh.geometry.dispose();
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.dispose());
                } else {
                    mesh.material.dispose();
                }
            }
        }
        this.meshes = [];
    }
}
