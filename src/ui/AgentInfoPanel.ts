import { AgentPool, AgentState } from '../agents/AgentPool';

const STATE_LABELS: Record<number, string> = {
    [AgentState.WANDER]:     'Wandering',
    [AgentState.SEEK_FOOD]:  'Seeking food',
    [AgentState.EAT]:        'Eating',
    [AgentState.SEEK_WATER]: 'Seeking water',
    [AgentState.DRINK]:      'Drinking',
    [AgentState.DEAD]:       'Dead',
};

/**
 * AgentInfoPanel — fixed HTML overlay that shows data for the selected agent.
 * Shown when selectedIndex >= 0, hidden otherwise.
 */
export class AgentInfoPanel {
    private readonly panel:  HTMLElement;
    private idEl!:     HTMLSpanElement;
    private stateEl!:  HTMLSpanElement;
    private hungerEl!: HTMLSpanElement;
    private thirstEl!: HTMLSpanElement;
    private posEl!:    HTMLSpanElement;
    private targetEl!: HTMLSpanElement;

    constructor() {
        this.panel = document.createElement('div');
        this.panel.id = 'agent-info-panel';
        this.panel.innerHTML = `
            <div class="panel-header">Selected Agent</div>
            <div class="panel-section">
                <div class="stat-row"><span class="label">Index</span>    <span id="ai-id">—</span></div>
                <div class="stat-row"><span class="label">State</span>    <span id="ai-state">—</span></div>
                <div class="stat-row"><span class="label">Hunger</span>   <span id="ai-hunger">—</span></div>
                <div class="stat-row"><span class="label">Thirst</span>   <span id="ai-thirst">—</span></div>
                <div class="stat-row"><span class="label">Position</span> <span id="ai-pos">—</span></div>
                <div class="stat-row"><span class="label">Target</span>   <span id="ai-target">—</span></div>
            </div>
            <div class="panel-hint">Click empty space to deselect</div>
        `;
        this.panel.style.display = 'none';
        document.body.appendChild(this.panel);

        // IDs exist immediately (not deferred) since we created the element ourselves
        this.idEl     = document.getElementById('ai-id')!     as HTMLSpanElement;
        this.stateEl  = document.getElementById('ai-state')!  as HTMLSpanElement;
        this.hungerEl = document.getElementById('ai-hunger')! as HTMLSpanElement;
        this.thirstEl = document.getElementById('ai-thirst')! as HTMLSpanElement;
        this.posEl    = document.getElementById('ai-pos')!    as HTMLSpanElement;
        this.targetEl = document.getElementById('ai-target')! as HTMLSpanElement;
    }

    update(selectedIndex: number, pool: AgentPool): void {
        if (selectedIndex < 0 || selectedIndex >= pool.count) {
            this.panel.style.display = 'none';
            return;
        }

        this.panel.style.display = 'block';
        const i = selectedIndex;

        this.idEl.textContent     = String(i);
        this.stateEl.textContent  = STATE_LABELS[pool.state[i]] ?? '?';
        this.hungerEl.textContent = `${Math.round(pool.hunger[i] * 100)}%`;
        this.thirstEl.textContent = `${Math.round(pool.thirst[i] * 100)}%`;
        this.posEl.textContent    = `${pool.tileX[i]}, ${pool.tileY[i]}`;
        this.targetEl.textContent = `${Math.round(pool.targetX[i])}, ${Math.round(pool.targetY[i])}`;
    }
}
