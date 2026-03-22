import './style.css';
import { Renderer } from './renderer';
import { WorldSim } from './world/WorldSim';
import { ControlPanel } from './ui/ControlPanel';
import { SelectionManager } from './selection/SelectionManager';
import { AgentInfoPanel } from './ui/AgentInfoPanel';

let renderer: Renderer;
let world: WorldSim;
let controlPanel: ControlPanel;
let selectionManager: SelectionManager;
let agentInfoPanel: AgentInfoPanel;

let lastTime = performance.now();
let frames = 0;
let fpsAccum = 0;
let fpsEl: HTMLElement;

function init(): void {
    const canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
    fpsEl = document.getElementById('fps')!;

    renderer        = new Renderer(canvas);
    world           = new WorldSim(renderer.scene);
    controlPanel    = new ControlPanel(world, () => { selectionManager.selectedIndex = -1; });
    agentInfoPanel  = new AgentInfoPanel();
    selectionManager = new SelectionManager(
        canvas,
        renderer.camera,
        world.agentRenderer.getMesh(),
    );

    // Generate terrain and spawn initial agents
    world.reset();

    requestAnimationFrame(loop);
}

function loop(timestamp: number): void {
    const rawDt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // FPS counter
    frames++;
    fpsAccum += rawDt;
    if (fpsAccum >= 1.0) {
        fpsEl.textContent = `${Math.round(frames / fpsAccum)} FPS`;
        frames = 0;
        fpsAccum = 0;
    }

    selectionManager.clampToPool(world.agents.count);
    world.update(rawDt, selectionManager.selectedIndex, selectionManager.hoveredIndex);
    controlPanel.update(rawDt);
    agentInfoPanel.update(selectionManager.selectedIndex, world.agents);

    // Feed proxy meshes to outline passes (empty array hides the outline)
    const { hoverProxy, selectProxy } = world.agentRenderer;
    renderer.hoverOutline.selectedObjects  = hoverProxy.visible  ? [hoverProxy]  : [];
    renderer.selectOutline.selectedObjects = selectProxy.visible ? [selectProxy] : [];

    renderer.render();

    requestAnimationFrame(loop);
}

window.addEventListener('DOMContentLoaded', init);
