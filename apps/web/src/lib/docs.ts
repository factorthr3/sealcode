import 'server-only';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';
import { PLANS, TRIAL } from '@sealcode/shared';

/**
 * Customer docs live as Markdown in the repo's docs/customer and are rendered at build time.
 * Values that come from plan config are written as {{placeholders}} so the docs can't drift.
 */
const DOCS_DIR = join(process.cwd(), '../../docs/customer');

const PLACEHOLDERS: Record<string, string> = {
  'rpm.trial': String(TRIAL.rateLimitRpm),
  'rpm.team': String(PLANS.team.rateLimitRpm),
  'rpm.business': String(PLANS.business.rateLimitRpm),
  'rpm.enterprise': PLANS.enterprise.rateLimitRpm.toLocaleString('en-GB'),
};

export interface Doc {
  slug: string;
  title: string;
  summary: string;
  order: number;
  html: string;
}

function parse(slug: string, raw: string): Doc {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  const meta: Record<string, string> = {};
  for (const line of (match?.[1] ?? '').split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const body = (match ? raw.slice(match[0].length) : raw)
    .replace(/\{\{([a-z.]+)\}\}/g, (_, key: string) => PLACEHOLDERS[key] ?? `{{${key}}}`)
    // The page renders its own title.
    .replace(/^\s*# .*\n/, '');
  return {
    slug,
    title: meta.title ?? slug,
    summary: meta.summary ?? '',
    order: Number(meta.order ?? 99),
    html: marked.parse(body, { async: false, gfm: true }),
  };
}

export function allDocs(): Doc[] {
  return readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => parse(f.replace(/\.md$/, ''), readFileSync(join(DOCS_DIR, f), 'utf8')))
    .sort((a, b) => a.order - b.order);
}

export function getDoc(slug: string): Doc | null {
  return allDocs().find((d) => d.slug === slug) ?? null;
}
