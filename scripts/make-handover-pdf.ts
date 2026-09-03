/**
 * Phase 10: renders docs/handover/HANDOVER.md into
 * docs/FRACTIONAIRE_RELEASE_HANDOVER.pdf.
 *
 * Pipeline: markdown-it renders the document to HTML, mermaid code fences are
 * rendered to inline SVG inside a headless Chromium page (mermaid ships as an
 * ESM bundle in node_modules, so nothing is fetched from the network), a print
 * stylesheet is applied, and Chromium prints A4 pages with numbering.
 *
 * The script then extracts the rendered text back out of the page and fails if
 * raw markdown artifacts survived (fence markers, table pipes, heading
 * hashes), so a broken render cannot ship silently.
 *
 * Usage: npx tsx scripts/make-handover-pdf.ts
 */

import './lib/bootstrap';

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import MarkdownIt from 'markdown-it';
import { chromium } from '@playwright/test';

const require = createRequire(__filename);

const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(REPO_ROOT, 'docs', 'handover', 'HANDOVER.md');
const TARGET = path.join(REPO_ROOT, 'docs', 'FRACTIONAIRE_RELEASE_HANDOVER.pdf');

const PRINT_CSS = `
  @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.5;
    color: #16181d;
    margin: 0;
  }
  h1 {
    font-size: 21pt;
    margin: 0 0 4pt;
    padding-bottom: 6pt;
    border-bottom: 2px solid #16181d;
  }
  h2 {
    font-size: 14pt;
    margin: 20pt 0 6pt;
    padding-top: 4pt;
    border-top: 1px solid #d8dbe2;
    break-after: avoid;
  }
  h3 { font-size: 11.5pt; margin: 13pt 0 4pt; break-after: avoid; }
  h4 { font-size: 10.5pt; margin: 10pt 0 3pt; break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  ul, ol { padding-left: 16pt; }
  li { margin: 2pt 0; }
  code {
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 9pt;
    background: #f2f3f6;
    padding: 1pt 3pt;
    border-radius: 3px;
  }
  pre {
    background: #f7f8fa;
    border: 1px solid #e2e5ea;
    border-radius: 4px;
    padding: 7pt 9pt;
    font-size: 8.5pt;
    line-height: 1.42;
    white-space: pre-wrap;
    word-break: break-word;
    break-inside: avoid;
  }
  pre code { background: none; padding: 0; font-size: inherit; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8pt 0;
    font-size: 8.8pt;
    break-inside: auto;
  }
  th, td {
    border: 1px solid #d8dbe2;
    padding: 4pt 5pt;
    text-align: left;
    vertical-align: top;
    word-break: break-word;
  }
  th { background: #f2f3f6; font-weight: 600; }
  tr { break-inside: avoid; }
  blockquote {
    margin: 8pt 0;
    padding: 5pt 10pt;
    border-left: 3px solid #c8ccd4;
    background: #fafbfc;
    color: #3d424c;
  }
  a { color: #16181d; text-decoration: underline; }
  .mermaid-figure {
    margin: 10pt 0;
    text-align: center;
    break-inside: avoid;
  }
  .mermaid-figure svg { max-width: 100%; height: auto; }
  hr { border: none; border-top: 1px solid #d8dbe2; margin: 14pt 0; }
`;

interface MermaidBlock {
  id: string;
  code: string;
}

/**
 * Renders the markdown, pulling mermaid fences out into placeholders that the
 * browser step fills with SVG.
 */
function renderMarkdown(markdown: string): { html: string; blocks: MermaidBlock[] } {
  const blocks: MermaidBlock[] = [];
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false });

  const defaultFence =
    md.renderer.rules.fence ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = (token.info || '').trim().toLowerCase();
    if (info === 'mermaid') {
      const id = `mermaid-${blocks.length}`;
      blocks.push({ id, code: token.content });
      return `<div class="mermaid-figure" id="${id}"></div>`;
    }
    return defaultFence(tokens, idx, options, env, self);
  };

  return { html: md.render(markdown), blocks };
}

/** Markdown that survived rendering means the pipeline is broken. */
function findRawMarkdown(text: string): string[] {
  const problems: string[] = [];
  if (text.includes('```')) {
    problems.push('code fence markers (```)');
  }
  if (/\|\s*-{3,}\s*\|/.test(text)) {
    problems.push('table separator rows (|---|)');
  }
  // The whitespace class excludes newlines on purpose: a table whose first
  // column header is literally "#" puts that cell on its own innerText line,
  // which is not an unrendered heading.
  const headings = text.match(/^[^\S\n]{0,3}#{1,6}[^\S\n]+\S.*$/gm);
  if (headings) {
    problems.push(
      `unrendered ATX headings (#): ${headings.slice(0, 3).map((h) => JSON.stringify(h.trim())).join(', ')}`,
    );
  }
  if (/\[[^\]\n]{1,80}\]\((?:https?:|\.|\/)[^)\n]{1,200}\)/.test(text)) {
    problems.push('unrendered markdown links');
  }
  return problems;
}

async function main(): Promise<void> {
  const markdown = await fs.readFile(SOURCE, 'utf8');

  if (markdown.includes('—') || markdown.includes('–')) {
    throw new Error(
      'the handover source contains an em or en dash, which the writing rules forbid',
    );
  }

  const { html, blocks } = renderMarkdown(markdown);
  // The classic (esbuild IIFE) bundle is self contained, unlike the ESM builds
  // which are code split across dist/chunks and cannot be injected inline.
  const mermaidPath = require.resolve('mermaid/dist/mermaid.min.js');
  const mermaidSource = await fs.readFile(mermaidPath, 'utf8');

  const page = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Fractionaire release handover</title>
<style>${PRINT_CSS}</style></head>
<body><main id="doc">${html}</main></body>
</html>`;

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1240, height: 1754 } });
    const tab = await context.newPage();
    tab.on('console', (message) => {
      if (message.type() === 'error') {
        console.warn(`[pdf] page error: ${message.text()}`);
      }
    });
    await tab.setContent(page, { waitUntil: 'load' });

    if (blocks.length > 0) {
      // mermaid is injected from disk, so the render works with no network
      // access at all. The bundle is an esbuild IIFE that publishes the module
      // namespace on a private global rather than window.mermaid.
      await tab.addScriptTag({ content: mermaidSource });
      await tab.addScriptTag({
        content: `
          window.__renderMermaid = async (blocks) => {
            const ns = window.__esbuild_esm_mermaid_nm && window.__esbuild_esm_mermaid_nm.mermaid;
            const mermaid = (ns && (ns.default || ns)) || window.mermaid;
            if (!mermaid || typeof mermaid.render !== 'function') {
              return { ok: false, error: 'mermaid did not load' };
            }
            mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
            for (const block of blocks) {
              const host = document.getElementById(block.id);
              if (!host) { continue; }
              try {
                const { svg } = await mermaid.render(block.id + '-svg', block.code);
                host.innerHTML = svg;
              } catch (error) {
                host.innerHTML = '<pre>' + String(error) + '</pre>';
                return { ok: false, error: String(error) };
              }
            }
            return { ok: true };
          };
        `,
      });
      await tab.waitForFunction('typeof window.__renderMermaid === "function"', undefined, {
        timeout: 30_000,
      });
      const result = (await tab.evaluate(
        (input) =>
          (
            window as unknown as {
              __renderMermaid: (b: MermaidBlock[]) => Promise<{ ok: boolean; error?: string }>;
            }
          ).__renderMermaid(input),
        blocks,
      )) as { ok: boolean; error?: string };
      if (!result.ok) {
        throw new Error(`mermaid rendering failed: ${result.error ?? 'unknown error'}`);
      }
      const svgCount = await tab.locator('.mermaid-figure svg').count();
      if (svgCount !== blocks.length) {
        throw new Error(
          `expected ${blocks.length} rendered diagram(s), found ${svgCount}`,
        );
      }
      console.log(`[pdf] rendered ${svgCount} mermaid diagram(s)`);
    }

    // Prose only: code blocks legitimately contain markdown-looking text (the
    // runbook's shell snippets start comments with #), so they are stripped
    // before the artifact check runs.
    const renderedText = await tab.evaluate(() => {
      const doc = document.getElementById('doc');
      if (!doc) {
        return '';
      }
      const clone = doc.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('pre, code, svg').forEach((node) => node.remove());
      return clone.innerText;
    });
    const problems = findRawMarkdown(renderedText);
    if (problems.length > 0) {
      throw new Error(`the rendered document still shows raw markdown: ${problems.join(', ')}`);
    }

    await fs.mkdir(path.dirname(TARGET), { recursive: true });
    await tab.pdf({
      path: TARGET,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%;font-size:8pt;color:#6b7280;padding:0 16mm;' +
        'font-family:-apple-system,Helvetica,Arial,sans-serif;display:flex;' +
        'justify-content:space-between;">' +
        '<span>Fractionaire release handover</span>' +
        '<span><span class="pageNumber"></span> / <span class="totalPages"></span></span>' +
        '</div>',
      margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
    });
  } finally {
    await browser.close();
  }

  const { size } = await fs.stat(TARGET);
  console.log(
    `[pdf] wrote ${path.relative(REPO_ROOT, TARGET)} (${Math.round((size / 1024) * 10) / 10} KB)`,
  );
}

main().catch((error) => {
  console.error('[pdf]', error instanceof Error ? error.message : error);
  process.exit(1);
});
