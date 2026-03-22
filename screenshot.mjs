#!/usr/bin/env node
/**
 * screenshot.mjs
 * Starts the Vite dev server, waits for it to be ready, lets WebGL render
 * for a configurable delay, then takes a screenshot and exits.
 *
 * Usage:  node screenshot.mjs [delay_ms]     (default: 4000 ms)
 * Output: screenshots/screenshot-<timestamp>.png
 */

import { chromium }  from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn }      from 'child_process';
import { existsSync } from 'fs';
import { mkdir }      from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir   = dirname(fileURLToPath(import.meta.url));
const DELAY   = parseInt(process.argv[2] ?? '4000', 10);
// Random ephemeral port to avoid clashing with any running dev server
const PORT    = 5200 + Math.floor(Math.random() * 800);
const DEV_URL = `http://localhost:${PORT}`;
const OUT_DIR = join(__dir, 'screenshots');

const CHROMIUM_ARGS = [
    '--enable-webgl',
    '--enable-webgl2',
    '--use-gl=swiftshader',
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

        const page = await browser.newPage({
            viewport: { width: 1280, height: 800 },
        });

        const pageErrors = [];
        const consoleLogs = [];
        page.on('console', msg => {
            consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
            if (msg.type() === 'error') pageErrors.push(msg.text());
        });
        page.on('pageerror', err => pageErrors.push(err.message));

        console.log(`Opening ${DEV_URL} ...`);
        await page.goto(DEV_URL, { waitUntil: 'networkidle' });
        console.log(`Waiting ${DELAY}ms for WebGL to render...`);
        await page.waitForTimeout(DELAY);

        // Query water stats from the page's simulation object
        const waterInfo = await page.evaluate(() => {
            // Poke at Three.js renderer info for draw call count
            const canvas = document.querySelector('#gl-canvas');
            return canvas ? 'canvas found' : 'no canvas';
        });
        console.log('Page state:', waterInfo);

        if (consoleLogs.length > 0) {
            console.log('\nPage console output:');
            consoleLogs.forEach(l => console.log(' ', l));
        }

        const stamp   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const outPath = join(OUT_DIR, `screenshot-${stamp}.png`);
        await page.screenshot({ path: outPath });
        console.log(`\nScreenshot saved → ${outPath}`);

        if (pageErrors.length > 0) {
            console.warn('\nPage errors:');
            pageErrors.forEach(e => console.warn('  ', e));
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
