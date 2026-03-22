#!/usr/bin/env node
/**
 * record.mjs
 * Starts the Vite dev server, lets WebGL render, records a video using
 * Playwright's built-in video capture, then saves it to videos/.
 *
 * Usage:  node record.mjs [duration_ms]     (default: 30000 ms)
 * Output: videos/recording-<timestamp>.webm
 */

import { chromium }     from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn }        from 'child_process';
import { existsSync }   from 'fs';
import { mkdir, rename } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir    = dirname(fileURLToPath(import.meta.url));
const DURATION = parseInt(process.argv[2] ?? '30000', 10);
const PORT     = 5200 + Math.floor(Math.random() * 800);
const DEV_URL  = `http://localhost:${PORT}/`;
const OUT_DIR  = join(__dir, 'videos');
const WIDTH    = 1280;
const HEIGHT   = 800;

// How long to wait before starting the recording (let the sim initialise)
const WARMUP_MS = 5000;

const CHROMIUM_ARGS = [
    '--enable-webgl',
    '--enable-webgl2',
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--disable-setuid-sandbox',
];

function findChromium() {
    const candidates = [
        '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
        '/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',
        '/root/.cache/ms-playwright/chromium-1208/chrome-linux/chrome',
    ];
    for (const p of candidates) {
        if (existsSync(p)) return p;
    }
    throw new Error('No cached Chromium found. Run: npx playwright install chromium');
}

async function waitForServer(url, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(url);
            if (res.ok) return;
        } catch { /* not up yet */ }
        await new Promise(r => setTimeout(r, 300));
    }
    throw new Error(`Dev server at ${url} did not respond within ${timeoutMs}ms`);
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });

    const chromiumPath = findChromium();
    console.log('Using Chromium:', chromiumPath);
    console.log(`Starting Vite dev server on port ${PORT}...`);

    const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
        cwd: __dir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, BROWSER: 'none' },
    });
    vite.stdout.on('data', d => process.stdout.write(`[vite] ${d}`));
    vite.stderr.on('data', d => process.stderr.write(`[vite] ${d}`));

    try {
        await waitForServer(DEV_URL);
        console.log('Dev server ready.');

        const browser = await chromium.launch({
            executablePath: chromiumPath,
            headless: true,
            args: CHROMIUM_ARGS,
        });

        // Playwright records video at the context level
        const context = await browser.newContext({
            viewport: { width: WIDTH, height: HEIGHT },
            recordVideo: {
                dir: OUT_DIR,
                size: { width: WIDTH, height: HEIGHT },
            },
        });

        const page = await context.newPage();

        page.on('console', msg => {
            if (msg.type() === 'error') console.error(`[page] ${msg.text()}`);
        });
        page.on('pageerror', err => console.error(`[page error] ${err.message}`));

        console.log(`Opening ${DEV_URL} ...`);
        await page.goto(DEV_URL, { waitUntil: 'networkidle' });

        console.log(`Warming up for ${WARMUP_MS}ms...`);
        await page.waitForTimeout(WARMUP_MS);

        console.log(`Recording for ${DURATION}ms...`);
        await page.waitForTimeout(DURATION);

        // Closing the context finalises and flushes the video file
        await context.close();

        // Playwright names the file with a random UUID; rename it to something readable
        const stamp    = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const outPath  = join(OUT_DIR, `recording-${stamp}.webm`);
        const videoPath = await page.video()?.path();
        if (videoPath) {
            await rename(videoPath, outPath);
            console.log(`\nVideo saved → ${outPath}`);
        } else {
            console.log(`\nVideo saved to ${OUT_DIR} (check for .webm files)`);
        }

        await browser.close();
    } finally {
        vite.kill('SIGTERM');
    }
}

main().catch(err => {
    console.error('\nFATAL:', err.message);
    process.exit(1);
});
