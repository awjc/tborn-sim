import './style.css';
import { Renderer } from './renderer';
import { WorldSim } from './world/WorldSim';
import { ControlPanel } from './ui/ControlPanel';

let renderer: Renderer;
let world: WorldSim;
let controlPanel: ControlPanel;

let lastTime = performance.now();
let frames = 0;
let fpsAccum = 0;
let fpsEl: HTMLElement;

function init(): void {
    const canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
    fpsEl = document.getElementById('fps')!;

    renderer     = new Renderer(canvas);
    world        = new WorldSim(renderer.scene);
    controlPanel = new ControlPanel(world);

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

    world.update(rawDt);
    controlPanel.update(rawDt);
    renderer.render();

    requestAnimationFrame(loop);
}

window.addEventListener('DOMContentLoaded', init);
