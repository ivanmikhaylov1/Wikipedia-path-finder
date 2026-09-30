import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const url = process.env.LIGHTHOUSE_URL ?? 'http://127.0.0.1:4173/';
const categories = ['performance', 'accessibility', 'best-practices', 'seo'];
let server;
try { await fetch(url); } catch {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--config', 'vite.config.ts', '--base', '/', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(url); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
}
let chrome;
try {
  chrome = await launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless', '--no-sandbox', '--disable-dev-shm-usage'] });
  const scores = [];
  await mkdir('lighthouse-reports', { recursive: true });
  for (let run = 1; run <= 3; run++) {
    const result = await lighthouse(url, { port: chrome.port, output: ['html', 'json'], logLevel: 'error', onlyCategories: categories });
    if (!result || result.lhr.runtimeError) throw new Error(result?.lhr.runtimeError?.message ?? 'Lighthouse produced no result');
    await writeFile(`lighthouse-reports/mobile-${run}.html`, result.report[0]);
    await writeFile(`lighthouse-reports/mobile-${run}.json`, result.report[1]);
    const score = Object.fromEntries(categories.map(category => [category, Math.round(result.lhr.categories[category].score * 100)]));
    scores.push(score);
    console.log(JSON.stringify({ run, ...score }));
  }
  const medians = Object.fromEntries(categories.map(category => [category, scores.map(score => score[category]).sort((a, b) => a - b)[1]]));
  await writeFile('lighthouse-reports/scores.json', JSON.stringify({ profile: 'mobile, simulated throttling', runs: scores, medians }, null, 2));
  console.log('Mobile Lighthouse median:', medians);
  if (Object.values(medians).some(score => score < 90)) process.exitCode = 1;
} finally { if (chrome) await chrome.kill(); if (server) server.kill(); }
