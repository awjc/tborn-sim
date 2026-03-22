# tborn-sim

A browser-based voxel ecosystem simulator with water physics and creature AI, inspired by Timberborn.

[Live demo](https://awjc.github.io/tborn-sim/)

## Features

- **Voxel world** — N×M×8 procedurally generated terrain using simplex noise
- **Water physics** — cellular automaton simulation with pressure-based flow, sources, sinks, and evaporation
- **Creature agents** — up to 200 agents with hunger/thirst needs, state-machine AI (wander → seek food/water → eat/drink), A* pathfinding, and death
- **Rendering** — chunked Three.js mesh batching, orbit camera, agent health color coding, FPS counter

## Stack

- TypeScript + Three.js + Vite
- `simplex-noise` for terrain generation

## Run locally

```bash
npm install
npm run dev      # dev server at http://localhost:5173/tborn-sim/
npm run build    # production build
```

## Configuration

All tunable parameters (world size, water flow rates, agent behavior, colors) are in `src/config.ts`.
