import * as THREE from 'three';

/** Mouse movement below this many pixels is treated as a click, not a drag. */
const DRAG_THRESHOLD = 4;

/**
 * SelectionManager — listens for left-click on the canvas and raycasts
 * against the agent InstancedMesh to determine which agent was clicked.
 *
 * selectedIndex is -1 when nothing is selected.
 */
export class SelectionManager {
    selectedIndex = -1;
    hoveredIndex  = -1;

    private readonly raycaster = new THREE.Raycaster();
    private readonly ndcMouse  = new THREE.Vector2();
    private mouseDownX = 0;
    private mouseDownY = 0;

    private readonly canvas:    HTMLCanvasElement;
    private readonly camera:    THREE.Camera;
    private readonly agentMesh: THREE.InstancedMesh;

    constructor(canvas: HTMLCanvasElement, camera: THREE.Camera, agentMesh: THREE.InstancedMesh) {
        this.canvas    = canvas;
        this.camera    = camera;
        this.agentMesh = agentMesh;
        canvas.addEventListener('mousedown',  this.onMouseDown);
        canvas.addEventListener('mouseup',    this.onMouseUp);
        canvas.addEventListener('mousemove',  this.onMouseMove);
    }

    private toNDC(clientX: number, clientY: number): void {
        const rect = this.canvas.getBoundingClientRect();
        this.ndcMouse.set(
             ((clientX - rect.left) / rect.width)  * 2 - 1,
            -((clientY - rect.top)  / rect.height) * 2 + 1,
        );
    }

    private onMouseDown = (e: MouseEvent): void => {
        this.mouseDownX = e.clientX;
        this.mouseDownY = e.clientY;
    };

    private onMouseUp = (e: MouseEvent): void => {
        // Ignore if the mouse moved enough to be a drag
        const dx = e.clientX - this.mouseDownX;
        const dy = e.clientY - this.mouseDownY;
        if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) return;

        this.toNDC(e.clientX, e.clientY);
        this.raycaster.setFromCamera(this.ndcMouse, this.camera);
        const hits = this.raycaster.intersectObject(this.agentMesh);

        if (hits.length > 0 && hits[0].instanceId !== undefined) {
            this.selectedIndex = hits[0].instanceId;
        } else {
            this.selectedIndex = -1;
        }
    };

    private onMouseMove = (e: MouseEvent): void => {
        this.toNDC(e.clientX, e.clientY);
        this.raycaster.setFromCamera(this.ndcMouse, this.camera);
        const hits = this.raycaster.intersectObject(this.agentMesh);

        if (hits.length > 0 && hits[0].instanceId !== undefined) {
            this.hoveredIndex = hits[0].instanceId;
            this.canvas.style.cursor = 'pointer';
        } else {
            this.hoveredIndex = -1;
            this.canvas.style.cursor = 'default';
        }
    };

    /** Call when the agent pool shrinks (swap-remove) so stale indices are cleared. */
    clampToPool(agentCount: number): void {
        if (this.selectedIndex >= agentCount) this.selectedIndex = -1;
        if (this.hoveredIndex  >= agentCount) this.hoveredIndex  = -1;
    }

    dispose(): void {
        this.canvas.removeEventListener('mousedown', this.onMouseDown);
        this.canvas.removeEventListener('mouseup',   this.onMouseUp);
        this.canvas.removeEventListener('mousemove', this.onMouseMove);
    }
}
