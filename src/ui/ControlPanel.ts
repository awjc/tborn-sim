import { WorldSim } from '../world/WorldSim';
import { UI_CONFIG, AGENT_CONFIG } from '../config';

/**
 * ControlPanel — minimal HTML overlay for simulation controls and stats.
 * Stats refresh at UI_CONFIG.STATS_UPDATE_HZ.
 */
export class ControlPanel {
    private world: WorldSim;
    private panel: HTMLElement;
    private statsTimer = 0;
    private readonly statsInterval: number;

    // Stat spans
    private agentEl!:    HTMLSpanElement;
    private foodEl!:     HTMLSpanElement;
    private waterEl!:    HTMLSpanElement;
    private deathEl!:    HTMLSpanElement;
    private timeEl!:     HTMLSpanElement;

    constructor(world: WorldSim) {
        this.world = world;
        this.statsInterval = 1 / UI_CONFIG.STATS_UPDATE_HZ;
        this.panel = this.buildPanel();
        document.body.appendChild(this.panel);
    }

    private buildPanel(): HTMLElement {
        const panel = document.createElement('div');
        panel.id = 'control-panel';
        panel.innerHTML = `
            <div class="panel-header">Tborn Sim</div>

            <div class="panel-section">
                <div class="stat-row"><span class="label">Agents</span> <span id="stat-agents">—</span></div>
                <div class="stat-row"><span class="label">Food tiles</span> <span id="stat-food">—</span></div>
                <div class="stat-row"><span class="label">Water cover</span> <span id="stat-water">—</span>%</div>
                <div class="stat-row"><span class="label">Deaths</span> <span id="stat-deaths">—</span></div>
                <div class="stat-row"><span class="label">Time</span> <span id="stat-time">—</span>s</div>
            </div>

            <div class="panel-section">
                <label class="slider-label">Speed
                    <input type="range" id="speed-slider"
                        min="${UI_CONFIG.SPEED_MIN}" max="${UI_CONFIG.SPEED_MAX}" step="0.1"
                        value="${UI_CONFIG.SPEED_DEFAULT}">
                    <span id="speed-val">${UI_CONFIG.SPEED_DEFAULT}×</span>
                </label>
            </div>

            <div class="panel-section panel-buttons">
                <button id="btn-pause">Pause</button>
                <button id="btn-reset">Reset</button>
                <button id="btn-spawn">+Agent</button>
            </div>

            <div class="panel-section">
                <label class="slider-label">Agents
                    <input type="range" id="agent-slider"
                        min="1" max="${AGENT_CONFIG.MAX_AGENTS}" step="1"
                        value="${AGENT_CONFIG.COUNT}">
                    <span id="agent-val">${AGENT_CONFIG.COUNT}</span>
                </label>
            </div>
        `;

        // Wire up after appending (IDs need to exist in DOM)
        requestAnimationFrame(() => {
            this.agentEl  = document.getElementById('stat-agents')!   as HTMLSpanElement;
            this.foodEl   = document.getElementById('stat-food')!     as HTMLSpanElement;
            this.waterEl  = document.getElementById('stat-water')!    as HTMLSpanElement;
            this.deathEl  = document.getElementById('stat-deaths')!   as HTMLSpanElement;
            this.timeEl   = document.getElementById('stat-time')!     as HTMLSpanElement;

            const speedSlider = document.getElementById('speed-slider')! as HTMLInputElement;
            const speedVal    = document.getElementById('speed-val')!    as HTMLSpanElement;
            speedSlider.addEventListener('input', () => {
                const v = parseFloat(speedSlider.value);
                this.world.timeScale = v;
                speedVal.textContent  = `${v.toFixed(1)}×`;
            });

            const agentSlider = document.getElementById('agent-slider')! as HTMLInputElement;
            const agentVal    = document.getElementById('agent-val')!    as HTMLSpanElement;
            agentSlider.addEventListener('input', () => {
                agentVal.textContent = agentSlider.value;
            });

            document.getElementById('btn-pause')!.addEventListener('click', () => {
                this.world.isPaused = !this.world.isPaused;
                (document.getElementById('btn-pause')! as HTMLButtonElement)
                    .textContent = this.world.isPaused ? 'Resume' : 'Pause';
            });

            document.getElementById('btn-reset')!.addEventListener('click', () => {
                const count = parseInt(agentSlider.value, 10);
                this.world.reset(count);
            });

            document.getElementById('btn-spawn')!.addEventListener('click', () => {
                // Spawn at a random passable tile
                const pool = this.world.agents;
                const w    = this.world.world;
                for (let tries = 0; tries < 100; tries++) {
                    const x = Math.floor(Math.random() * 64);
                    const y = Math.floor(Math.random() * 64);
                    if (w.isPassable(x, y)) {
                        pool.spawn(x, y);
                        break;
                    }
                }
            });
        });

        return panel;
    }

    /** Called every frame; updates stats at the configured rate */
    update(deltaTime: number): void {
        this.statsTimer += deltaTime;
        if (this.statsTimer < this.statsInterval) return;
        this.statsTimer = 0;

        if (!this.agentEl) return; // DOM not ready yet
        const s = this.world.getStats();
        this.agentEl.textContent  = String(s.agents);
        this.foodEl.textContent   = String(s.foodTiles);
        this.waterEl.textContent  = String(s.waterCoverage);
        this.deathEl.textContent  = String(s.totalDeaths);
        this.timeEl.textContent   = String(s.simTime);
    }
}
