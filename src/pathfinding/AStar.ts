import { GRID_CONFIG } from '../config';
import { colIndex, colX, colY, neighbours4 } from '../utils/TileUtils';

const { WIDTH, HEIGHT } = GRID_CONFIG;

/**
 * A* pathfinding on the 2-D surface graph.
 *
 * Pure function — no DOM or Three.js imports so it can be moved to
 * a Web Worker later with zero changes to this file.
 *
 * Nodes are column indices (y * WIDTH + x).
 * Edge cost = 1 + abs(heightDiff) * HEIGHT_PENALTY (going uphill costs more).
 * Returns an array of column indices from start (exclusive) to goal (inclusive),
 * or null if no path exists.
 */

const HEIGHT_PENALTY = 2.0; // Extra cost per unit of height gain

export function aStar(
    startCol: number,
    goalCol:  number,
    solidHeight: Int8Array,
    isPassable: (x: number, y: number) => boolean
): number[] | null {
    if (startCol === goalCol) return [];

    // --- Data structures ---
    const gScore    = new Float32Array(WIDTH * HEIGHT).fill(Infinity);
    const fScore    = new Float32Array(WIDTH * HEIGHT).fill(Infinity);
    const cameFrom  = new Int32Array(WIDTH * HEIGHT).fill(-1);
    const inOpen    = new Uint8Array(WIDTH * HEIGHT);

    // Min-heap stored as a flat array of [fScore, colIndex] pairs
    // Using a simple binary heap
    const heap: number[] = []; // interleaved [f0, col0, f1, col1, ...]

    gScore[startCol] = 0;
    fScore[startCol] = heuristic(startCol, goalCol);
    heapPush(heap, fScore[startCol], startCol);
    inOpen[startCol] = 1;

    // goalX/goalY used for future heuristic improvements (diagonal etc.)
    void colX(goalCol); void colY(goalCol);

    while (heap.length > 0) {
        const { f: _f, col: current } = heapPop(heap);
        inOpen[current] = 0;

        if (current === goalCol) {
            return reconstructPath(cameFrom, goalCol);
        }

        const cx = colX(current);
        const cy = colY(current);
        const cH = solidHeight[current];

        for (const { x: nx, y: ny } of neighbours4(cx, cy)) {
            if (!isPassable(nx, ny)) continue;

            const nci = colIndex(nx, ny);
            const nH  = solidHeight[nci];

            // Height-sensitive movement cost
            const heightDiff = Math.max(0, nH - cH); // only penalise going UP
            const moveCost = 1 + heightDiff * HEIGHT_PENALTY;

            const tentativeG = gScore[current] + moveCost;
            if (tentativeG < gScore[nci]) {
                cameFrom[nci] = current;
                gScore[nci]   = tentativeG;
                fScore[nci]   = tentativeG + heuristic(nci, goalCol);

                if (!inOpen[nci]) {
                    inOpen[nci] = 1;
                    heapPush(heap, fScore[nci], nci);
                }
            }
        }
    }

    return null; // no path
}

function heuristic(a: number, b: number): number {
    // Manhattan distance
    return Math.abs(colX(a) - colX(b)) + Math.abs(colY(a) - colY(b));
}

function reconstructPath(cameFrom: Int32Array, goal: number): number[] {
    const path: number[] = [];
    let current = goal;
    while (cameFrom[current] !== -1) {
        path.push(current);
        current = cameFrom[current];
    }
    path.push(current); // include start
    path.reverse();
    path.shift();        // exclude start (agent is already there)
    return path;
}

// ---- Minimal binary min-heap ------------------------------------------------
// Interleaved [f0, col0, f1, col1, ...] layout

function heapPush(heap: number[], f: number, col: number): void {
    heap.push(f, col);
    siftUp(heap, (heap.length >> 1) - 1);
}

function heapPop(heap: number[]): { f: number; col: number } {
    const f   = heap[0];
    const col = heap[1];
    const lastF   = heap.pop()!;
    const lastCol = heap.pop()!;
    if (heap.length > 0) {
        heap[0] = lastF;
        heap[1] = lastCol;
        siftDown(heap, 0);
    }
    return { f, col };
}

function siftUp(heap: number[], i: number): void {
    while (i > 0) {
        const parent = Math.floor((i - 1) / 2);
        if (heap[parent * 2] > heap[i * 2]) {
            swapPairs(heap, parent, i);
            i = parent;
        } else break;
    }
}

function siftDown(heap: number[], i: number): void {
    const n = heap.length >> 1;
    while (true) {
        let smallest = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < n && heap[l * 2] < heap[smallest * 2]) smallest = l;
        if (r < n && heap[r * 2] < heap[smallest * 2]) smallest = r;
        if (smallest === i) break;
        swapPairs(heap, i, smallest);
        i = smallest;
    }
}

function swapPairs(heap: number[], a: number, b: number): void {
    const af = heap[a * 2]; const ac = heap[a * 2 + 1];
    heap[a * 2] = heap[b * 2]; heap[a * 2 + 1] = heap[b * 2 + 1];
    heap[b * 2] = af;          heap[b * 2 + 1] = ac;
}
