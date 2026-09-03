/**
 * Phase 9: turns a demo recording run into deliverable videos.
 *
 * Input:  e2e/demo-report.json (written by playwright.demo.config.ts) plus the
 *         webm files Playwright saved under test-results-demos/.
 * Output: docs/demos/NN-role-function.mp4 (h264, faststart) and
 *         docs/demos/INDEX.md listing every video with a short description
 *         and its duration.
 *
 * Usage:
 *   npx tsx scripts/make-demos.ts            convert and write the index
 *   npx tsx scripts/make-demos.ts --upload   also upload to Supabase Storage
 *                                            and link the public URLs in the
 *                                            index instead of the local paths
 *
 * The upload path exists because git should not carry hundreds of megabytes:
 * when the converted total exceeds SIZE_BUDGET_MB the script says so and
 * recommends --upload.
 */

import './lib/bootstrap';

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const REPO_ROOT = path.resolve(__dirname, '..');
const REPORT = path.join(REPO_ROOT, 'e2e', 'demo-report.json');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'demos');
const STORAGE_BUCKET = 'demos';
const SIZE_BUDGET_MB = 90;

/** Role prefix per spec file, and the order the index lists them in. */
const ROLE_BY_SPEC: Array<{ match: RegExp; role: string; order: number }> = [
  { match: /99-full-journey/, role: 'full', order: 0 },
  { match: /business\.spec/, role: 'business', order: 1 },
  { match: /investor\.spec/, role: 'investor', order: 2 },
  { match: /system\.spec/, role: 'system', order: 3 },
  { match: /reconcile\.spec/, role: 'system', order: 4 },
  { match: /harness/, role: 'harness', order: 5 },
];

/**
 * Two line descriptions keyed by output slug. Anything not listed falls back
 * to the test title, so a renamed or added test still produces a usable entry.
 */
const DESCRIPTIONS: Record<string, string> = {
  'full-journey':
    'End to end walkthrough: a business registers, verifies, mints and lists an asset, an investor buys with a card, resells, and a second investor buys the resale.\nEvery step is confirmed on chain and reflected in the dashboard, portfolio and transaction history.',
};

interface DemoEntry {
  role: string;
  order: number;
  title: string;
  slug: string;
  source: string;
}

interface PlaywrightJsonReport {
  suites?: PlaywrightJsonSuite[];
}

interface PlaywrightJsonSuite {
  title?: string;
  file?: string;
  suites?: PlaywrightJsonSuite[];
  specs?: Array<{
    title?: string;
    ok?: boolean;
    tests?: Array<{
      results?: Array<{
        status?: string;
        attachments?: Array<{ name?: string; contentType?: string; path?: string }>;
      }>;
    }>;
  }>;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    // Drop the leading spec ordinal ("06 buys with card" -> "buys with card").
    .replace(/^\d+\s+/, '')
    // Drop trailing clarifications after a colon.
    .replace(/:.*$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function roleFor(file: string): { role: string; order: number } {
  for (const candidate of ROLE_BY_SPEC) {
    if (candidate.match.test(file)) {
      return { role: candidate.role, order: candidate.order };
    }
  }
  return { role: 'other', order: 9 };
}

/** Walks the nested report structure collecting every test that has a video. */
function collect(suite: PlaywrightJsonSuite, file: string, into: DemoEntry[]): void {
  const currentFile = suite.file ?? file;
  for (const spec of suite.specs ?? []) {
    const title = spec.title ?? 'untitled';
    for (const test of spec.tests ?? []) {
      for (const result of test.results ?? []) {
        const video = (result.attachments ?? []).find(
          (a) => a.contentType?.startsWith('video/') && a.path,
        );
        if (!video?.path) {
          continue;
        }
        if (result.status !== 'passed') {
          // A failed take is not a demo; the suite must be green first.
          continue;
        }
        const { role, order } = roleFor(currentFile);
        into.push({
          role,
          order,
          title,
          slug: slugify(title),
          source: video.path,
        });
      }
    }
  }
  for (const child of suite.suites ?? []) {
    collect(child, currentFile, into);
  }
}

async function ffprobeDuration(file: string): Promise<string> {
  try {
    const { stdout } = await run('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      file,
    ]);
    const seconds = Number.parseFloat(stdout.trim());
    if (!Number.isFinite(seconds)) {
      return 'unknown';
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  } catch {
    return 'unknown';
  }
}

async function convert(source: string, target: string): Promise<void> {
  await run('ffmpeg', [
    '-y',
    '-i',
    source,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '26',
    '-pix_fmt',
    'yuv420p',
    // Even dimensions are required by yuv420p.
    '-vf',
    'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-movflags',
    '+faststart',
    '-an',
    target,
  ]);
}

async function uploadAll(files: string[]): Promise<Record<string, string>> {
  const { createServiceClient } = await import('../src/lib/supabase/server');
  const supabase = createServiceClient();
  const urls: Record<string, string> = {};

  // The bucket is created on demand and made public so the index links work
  // for anyone who can read the handover document.
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === STORAGE_BUCKET)) {
    const { error } = await supabase.storage.createBucket(STORAGE_BUCKET, { public: true });
    if (error) {
      throw new Error(`could not create the ${STORAGE_BUCKET} bucket: ${error.message}`);
    }
  }

  for (const file of files) {
    const name = path.basename(file);
    const body = await fs.readFile(file);
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(name, body, { contentType: 'video/mp4', upsert: true });
    if (error) {
      throw new Error(`upload failed for ${name}: ${error.message}`);
    }
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(name);
    urls[name] = data.publicUrl;
    console.log(`[demos] uploaded ${name}`);
  }
  return urls;
}

async function main(): Promise<void> {
  const upload = process.argv.includes('--upload');

  let report: PlaywrightJsonReport;
  try {
    report = JSON.parse(await fs.readFile(REPORT, 'utf8')) as PlaywrightJsonReport;
  } catch {
    throw new Error(
      `could not read ${REPORT}. Record first: npx playwright test --config playwright.demo.config.ts`,
    );
  }

  const entries: DemoEntry[] = [];
  for (const suite of report.suites ?? []) {
    collect(suite, suite.file ?? '', entries);
  }
  if (entries.length === 0) {
    throw new Error('the demo report contains no passing test with a video attachment');
  }

  entries.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

  await fs.mkdir(OUT_DIR, { recursive: true });

  const rows: Array<{ file: string; role: string; title: string; slug: string; duration: string }> =
    [];
  const produced: string[] = [];
  let index = 0;

  for (const entry of entries) {
    // The walkthrough is 00 by convention; every other function counts up.
    const number = entry.role === 'full' ? '00' : String(++index).padStart(2, '0');
    const base =
      entry.role === 'full' ? '00-full-journey.mp4' : `${number}-${entry.role}-${entry.slug}.mp4`;
    const target = path.join(OUT_DIR, base);

    try {
      await convert(entry.source, target);
    } catch (error) {
      console.warn(`[demos] conversion failed for "${entry.title}": ${String(error)}`);
      continue;
    }
    produced.push(target);
    rows.push({
      file: base,
      role: entry.role,
      title: entry.title,
      slug: entry.role === 'full' ? 'full-journey' : entry.slug,
      duration: await ffprobeDuration(target),
    });
    console.log(`[demos] wrote ${base}`);
  }

  let links: Record<string, string> = {};
  let totalBytes = 0;
  for (const file of produced) {
    totalBytes += (await fs.stat(file)).size;
  }
  const totalMb = Math.round((totalBytes / (1024 * 1024)) * 10) / 10;

  if (upload) {
    links = await uploadAll(produced);
  }

  const lines: string[] = [
    '# Demo videos',
    '',
    'One video per product function, recorded by Playwright against the local',
    'stack (hardhat chain, seeded Supabase database, live chain indexer) with',
    'actions slowed to about 400 ms. Every clip runs from the first click to the',
    'confirmed result, including the on chain confirmation and the updated',
    'database state as the UI shows it.',
    '',
    `Recorded set: ${rows.length} videos, ${totalMb} MB total.`,
    '',
    'Regenerate with `npm run demos` (add `-- --upload` to publish to Supabase',
    'Storage and link the public URLs here instead of the local files).',
    '',
    '| # | Role | Function | Duration | Video |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const row of rows) {
    const target = links[row.file] ?? `./${row.file}`;
    const number = row.file.slice(0, 2);
    lines.push(
      `| ${number} | ${row.role} | ${row.title.replace(/^\d+\s+/, '')} | ${row.duration} | [${row.file}](${target}) |`,
    );
  }

  lines.push('');
  lines.push('## Descriptions');
  lines.push('');
  for (const row of rows) {
    const description = DESCRIPTIONS[row.slug] ?? row.title.replace(/^\d+\s+/, '');
    lines.push(`### ${row.file}`);
    lines.push('');
    for (const paragraph of description.split('\n')) {
      lines.push(paragraph);
    }
    lines.push('');
  }

  if (!upload && totalMb > SIZE_BUDGET_MB) {
    lines.push(
      `> The converted set is ${totalMb} MB, above the ${SIZE_BUDGET_MB} MB budget for git.`,
    );
    lines.push('> Re-run with `npm run demos -- --upload` and commit the links instead.');
    lines.push('');
  }

  await fs.writeFile(path.join(OUT_DIR, 'INDEX.md'), `${lines.join('\n')}\n`, 'utf8');
  console.log(
    `[demos] ${rows.length} video(s), ${totalMb} MB, index written to docs/demos/INDEX.md`,
  );
  if (!upload && totalMb > SIZE_BUDGET_MB) {
    console.warn(
      `[demos] total exceeds ${SIZE_BUDGET_MB} MB; consider npm run demos -- --upload`,
    );
  }
}

main().catch((error) => {
  console.error('[demos]', error instanceof Error ? error.message : error);
  process.exit(1);
});
