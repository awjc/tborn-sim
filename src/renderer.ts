import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GRID_CONFIG } from './config';

const { WIDTH, HEIGHT, TILE_SIZE } = GRID_CONFIG;

// World-space extent used to size the camera
const WORLD_SPAN = Math.max(WIDTH, HEIGHT) * TILE_SIZE;

/**
 * Renderer — Three.js scene, camera, lights, and render loop.
 * Stateless with respect to the simulation; just renders what's in the scene.
 */
export class Renderer {
    readonly renderer:     THREE.WebGLRenderer;
    readonly scene:        THREE.Scene;
    readonly camera:       THREE.PerspectiveCamera;
    readonly controls:     OrbitControls;
    readonly hoverOutline: OutlinePass;
    readonly selectOutline: OutlinePass;
    private readonly composer: EffectComposer;

    constructor(canvas: HTMLCanvasElement) {
        // WebGL renderer
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setClearColor('#87CEEB');
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#87CEEB');
        this.scene.fog = new THREE.FogExp2('#87CEEB', 0.001);

        // Camera — top-down angled view centred on the world origin
        this.camera = new THREE.PerspectiveCamera(55, 1, 0.5, 1000);
        this.camera.position.set(0, WORLD_SPAN * 0.9, WORLD_SPAN * 0.6);
        this.camera.lookAt(0, 0, 0);

        // Orbit controls — left/middle drag pans, right drag orbits (Timberborn style)
        this.controls = new OrbitControls(this.camera, canvas);
        this.controls.enableDamping  = true;
        this.controls.dampingFactor  = 0.06;
        this.controls.maxPolarAngle  = Math.PI / 2 - 0.05; // never below ground
        this.controls.minDistance    = WORLD_SPAN * 0.15;
        this.controls.maxDistance    = WORLD_SPAN * 2.5;
        this.controls.mouseButtons   = {
            LEFT:   null as unknown as THREE.MOUSE, // repurposed for agent selection
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT:  THREE.MOUSE.ROTATE,
        };

        // Lights
        this.setupLights();

        // Post-processing
        const size = new THREE.Vector2(canvas.clientWidth, canvas.clientHeight);
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        this.hoverOutline = new OutlinePass(size, this.scene, this.camera);
        this.hoverOutline.edgeStrength  = 4;
        this.hoverOutline.edgeThickness = 1;
        this.hoverOutline.edgeGlow      = 0;
        this.hoverOutline.visibleEdgeColor.set('#66bbff');
        this.hoverOutline.hiddenEdgeColor.set('#224466');
        this.composer.addPass(this.hoverOutline);

        this.selectOutline = new OutlinePass(size, this.scene, this.camera);
        this.selectOutline.edgeStrength  = 5;
        this.selectOutline.edgeThickness = 1.5;
        this.selectOutline.edgeGlow      = 0.5;
        this.selectOutline.visibleEdgeColor.set('#ffe566');
        this.selectOutline.hiddenEdgeColor.set('#664400');
        this.composer.addPass(this.selectOutline);

        this.composer.addPass(new OutputPass());

        // Resize handling
        this.resizeToCanvas(canvas);
        window.addEventListener('resize', () => this.resizeToCanvas(canvas));
    }

    private setupLights(): void {
        // Soft ambient fill
        this.scene.add(new THREE.AmbientLight('#ffffff', 0.55));

        // Directional sun
        const sun = new THREE.DirectionalLight('#fffde8', 0.9);
        sun.position.set(WORLD_SPAN * 0.6, WORLD_SPAN, WORLD_SPAN * 0.4);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const s = WORLD_SPAN * 0.7;
        sun.shadow.camera.left   = -s;
        sun.shadow.camera.right  =  s;
        sun.shadow.camera.top    =  s;
        sun.shadow.camera.bottom = -s;
        sun.shadow.camera.near   = 1;
        sun.shadow.camera.far    = WORLD_SPAN * 3;
        this.scene.add(sun);
    }

    private resizeToCanvas(canvas: HTMLCanvasElement): void {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        this.renderer.setSize(w, h, false);
        this.composer.setSize(w, h);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    render(): void {
        this.controls.update();
        this.composer.render();
    }
}
