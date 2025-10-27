import template from './templates/index.html';
import type { SiteRecord } from './types/directory';
import {
  assessDirectoryAgainstVision,
  visionConfig,
  VISION_YAML,
} from './config/vision';

type NextStep = {
  id: string;
  title: string;
  description: string;
};

type StatTile = {
  label: string;
  value: string;
  detail: string;
};

type InterestPayload = {
  name: string | null;
  email: string;
  organization: string | null;
  message: string | null;
};

export interface Env {
  DB: D1Database;
}

const SITE_QUERY = `
  SELECT
    s.id,
    s.name,
    s.description,
    s.website,
    COALESCE(GROUP_CONCAT(t.label, '\u001f'), '') AS tag_string
  FROM sites s
  LEFT JOIN site_tags st ON st.site_id = s.id
  LEFT JOIN tags t ON t.id = st.tag_id
  GROUP BY s.id
  ORDER BY s.created_at DESC, s.id DESC;
`;

const INSERT_INTEREST = `
  INSERT INTO interest_signups (name, email, organization, message)
  VALUES (?, ?, ?, ?);
`;

const INTEREST_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

async function fetchSites(env: Env): Promise<SiteRecord[]> {
  const { results } = await env.DB.prepare(SITE_QUERY).all<{
    id: number;
    name: string;
    description: string | null;
    website: string | null;
    tag_string: string;
  }>();

  return results.map((row) => ({
    ...row,
    tags: row.tag_string ? row.tag_string.split('\u001f').filter(Boolean) : [],
  }));
}

function renderSiteCard(site: SiteRecord): string {
  const tagList = site.tags
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join('');
  const description = site.description ? `<p>${escapeHtml(site.description)}</p>` : '';
  const link = site.website
    ? `<a href="${escapeAttribute(site.website)}" target="_blank" rel="noopener noreferrer">Visit site</a>`
    : '';

  return `
    <article class="site-card">
      <h2>${escapeHtml(site.name)}</h2>
      ${description}
      ${link}
      <div class="tag-list">${tagList}</div>
    </article>
  `;
}

function buildStatTiles(
  sites: SiteRecord[],
  metrics: ReturnType<typeof assessDirectoryAgainstVision>['metrics'],
): StatTile[] {
  const siteDetail = metrics.minimumSites
    ? metrics.siteCount >= metrics.minimumSites
      ? 'Launch benchmark achieved with community partners.'
      : `${Math.max(metrics.minimumSites - metrics.siteCount, 0)} more needed for launch.`
    : 'Gathering founding cooperatives.';

  const densityDetail = metrics.minimumTagDensity > 0
    ? `${metrics.averageTagsPerSite.toFixed(1)} tags per site (goal ${metrics.minimumTagDensity.toFixed(1)}).`
    : `${metrics.averageTagsPerSite.toFixed(1)} tags per site captured.`;

  const coveragePercent = Math.round(metrics.coverageRatio * 100);
  const missingTagsDetail = metrics.missingRecommendedTags.length
    ? `Missing: ${formatList(metrics.missingRecommendedTags)}.`
    : 'Every priority tag represented.';

  const baseStats: StatTile[] = [
    {
      label: 'Cooperatives listed',
      value: metrics.siteCount.toString(),
      detail: siteDetail,
    },
    {
      label: 'Story depth',
      value: sites.length ? `${metrics.averageTagsPerSite.toFixed(1)}×` : '—',
      detail: densityDetail,
    },
    {
      label: 'Vision coverage',
      value: `${coveragePercent}%`,
      detail: missingTagsDetail,
    },
  ];

  if (!sites.length) {
    baseStats[1] = {
      label: 'Story depth',
      value: '—',
      detail: 'Tag depth unlocks once the first cooperatives join.',
    };
  }

  return baseStats;
}

function renderStatTiles(stats: StatTile[]): string {
  if (!stats.length) {
    return `
      <div class="stat-card">
        <dt>Directory status</dt>
        <dd>Getting ready</dd>
        <p class="stat-detail">We are preparing the first SolarRoots partners.</p>
      </div>
    `.trim();
  }

  return stats
    .map(
      (stat) => `
        <div class="stat-card">
          <dt>${escapeHtml(stat.label)}</dt>
          <dd>${escapeHtml(stat.value)}</dd>
          <p class="stat-detail">${escapeHtml(stat.detail)}</p>
        </div>
      `.trim(),
    )
    .join('\n');
}

function renderHighlightCards(sites: SiteRecord[]): string {
  if (!sites.length) {
    return `
      <div class="empty-state">
        No cooperatives are listed yet. Add your first entries through a D1 migration or the
        <code>/api/sites</code> endpoint to seed the directory.
      </div>
    `.trim();
  }

  return sites
    .slice(0, 3)
    .map(renderSiteCard)
    .join('\n');
}

function renderPage(sites: SiteRecord[]): string {
  const assessment = assessDirectoryAgainstVision(sites);
  const statsMarkup = renderStatTiles(buildStatTiles(sites, assessment.metrics));
  const highlightMarkup = renderHighlightCards(sites);
  const nextSteps = determineNextSteps(sites);
  const nextStepsMarkup = renderNextSteps(nextSteps);
  const visionSummaryMarkup = renderVisionSummary(assessment);

  return template
    .replace('{{statTiles}}', statsMarkup)
    .replace('{{highlightCards}}', highlightMarkup)
    .replace('{{nextSteps}}', nextStepsMarkup)
    .replace('{{visionSummary}}', visionSummaryMarkup);
}

function determineNextSteps(sites: SiteRecord[]): NextStep[] {
  const steps: NextStep[] = [];
  const seen = new Set<string>();
  const assessment = assessDirectoryAgainstVision(sites);

  const addStep = (step: NextStep) => {
    if (seen.has(step.id)) {
      return;
    }
    seen.add(step.id);
    steps.push(step);
  };

  if (!assessment.metrics.meetsMinimumSites) {
    const remaining = Math.max(
      assessment.metrics.minimumSites - assessment.metrics.siteCount,
      0,
    );
    if (remaining > 0) {
      const noun = remaining === 1 ? 'entry' : 'entries';
      addStep({
        id: 'grow-directory-footprint',
        title: 'Grow the directory footprint',
        description: `Publish ${remaining} more directory ${noun} to reach the SolarRoots minimum of ${assessment.metrics.minimumSites}.`,
      });
    }
  }

  if (!sites.length) {
    addStep({
      id: 'seed-directory',
      title: 'Seed your directory data',
      description:
        'Add your first entries by applying a new D1 migration or sending a POST request to the /api/sites endpoint.',
    });
  } else {
    const sitesMissingDescriptions = sites.filter((site) => !site.description).length;
    if (sitesMissingDescriptions) {
      addStep({
        id: 'enrich-descriptions',
        title: 'Enrich site descriptions',
        description: `Provide meaningful descriptions for the ${sitesMissingDescriptions} entr${
          sitesMissingDescriptions === 1 ? 'y' : 'ies'
        } that currently lack context.`,
      });
    }

    const sitesMissingWebsites = sites.filter((site) => !site.website).length;
    if (sitesMissingWebsites) {
      addStep({
        id: 'verify-links',
        title: 'Add website links',
        description: `Share verified website URLs for ${sitesMissingWebsites} cooperativ${
          sitesMissingWebsites === 1 ? 'e' : 'es'
        } so visitors can connect directly.`,
      });
    }

    const tagSet = new Set<string>();
    for (const site of sites) {
      for (const tag of site.tags) {
        tagSet.add(tag);
      }
    }
    if (!tagSet.size) {
      addStep({
        id: 'categorise-sites',
        title: 'Add tags to categorise sites',
        description:
          'Create or assign tags that highlight technologies, ownership models, or regions to improve discovery.',
      });
    } else {
      if (assessment.metrics.missingRecommendedTags.length) {
        addStep({
          id: 'activate-vision-tags',
          title: 'Activate recommended SolarRoots tags',
          description: `Introduce tags for ${formatList(
            assessment.metrics.missingRecommendedTags,
          )} to reflect the movement priorities captured in the vision document.`,
        });
      }

      if (!assessment.metrics.meetsMinimumTagDensity) {
        addStep({
          id: 'deepen-tag-context',
          title: 'Deepen tag context',
          description: `Document more dimensions for each cooperative so the average tags per site reaches ${assessment.metrics.minimumTagDensity.toFixed(
            1,
          )}.`,
        });
      } else if (tagSet.size < Math.max(3, sites.length)) {
        addStep({
          id: 'expand-taxonomy',
          title: 'Expand your tagging taxonomy',
          description:
            'Broaden the tag set with additional topics so the directory can filter and group projects more effectively.',
        });
      }
    }
  }

  const evergreenSteps: NextStep[] = [
    {
      id: 'extend-schema',
      title: 'Extend the D1 schema',
      description: 'Model events, contacts, or regional data to support richer cooperative profiles.',
    },
    {
      id: 'add-authentication',
      title: 'Introduce authenticated submissions',
      description: 'Secure write operations so trusted organizers can submit updates directly from the site.',
    },
    {
      id: 'enhance-frontend',
      title: 'Pair with a richer frontend',
      description: 'Connect this worker to a Cloudflare Pages UI or SPA for multi-page navigation and advanced filtering.',
    },
  ];

  for (const step of evergreenSteps) {
    addStep(step);
  }

  return steps;
}

function renderNextSteps(steps: NextStep[]): string {
  if (!steps.length) {
    return `
      <li class="next-step">
        <h3>Keep exploring</h3>
        <p>Experiment with the directory data to uncover new improvements.</p>
      </li>
    `.trim();
  }

  return steps
    .map(
      (step) => `
        <li class="next-step">
          <h3>${escapeHtml(step.title)}</h3>
          <p>${escapeHtml(step.description)}</p>
        </li>
      `.trim(),
    )
    .join('\n');
}

function renderVisionSummary(assessment: ReturnType<typeof assessDirectoryAgainstVision>): string {
  const { metrics, progressScore } = assessment;
  const coveragePercent = Math.round(metrics.coverageRatio * 100);
  const minimumSitesLabel = metrics.minimumSites
    ? `${metrics.siteCount}/${metrics.minimumSites} sites published`
    : `${metrics.siteCount} sites published`;
  const densityGoalLabel = metrics.minimumTagDensity > 0
    ? `goal ${metrics.minimumTagDensity.toFixed(1)}`
    : 'no density goal';
  const densityLine = `${metrics.averageTagsPerSite.toFixed(1)} tags per site (${densityGoalLabel}).`;
  const missingTagsText = metrics.missingRecommendedTags.length
    ? `Missing tags: ${formatList(metrics.missingRecommendedTags)}.`
    : 'All recommended tags are represented.';

  const lines = [
    `<p class="vision-score"><strong>${progressScore.toFixed(1)}% alignment</strong> with the SolarRoots vision targets.</p>`,
    '<ul class="vision-metrics">',
    `  <li>${escapeHtml(minimumSitesLabel)}.</li>`,
    `  <li>${escapeHtml(densityLine)}</li>`,
    `  <li>${coveragePercent}% of recommended tags present. ${escapeHtml(missingTagsText)}</li>`,
    '</ul>',
  ];

  return lines.join('\n').trim();
}

function formatList(items: readonly string[]): string {
  if (items.length === 0) {
    return '';
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function sanitizeOptionalField(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function validateInterestPayload(data: unknown):
  | { valid: true; payload: InterestPayload }
  | { valid: false; error: string } {
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'Invalid request body.' };
  }

  const record = data as Record<string, unknown>;
  const emailRaw = typeof record.email === 'string' ? record.email.trim() : '';
  if (!emailRaw) {
    return { valid: false, error: 'Email is required.' };
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(emailRaw)) {
    return { valid: false, error: 'Enter a valid email address.' };
  }

  const payload: InterestPayload = {
    email: emailRaw.slice(0, 256),
    name: sanitizeOptionalField(record.name, 120),
    organization: sanitizeOptionalField(record.organization, 160),
    message: sanitizeOptionalField(record.message, 1500),
  };

  return { valid: true, payload };
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json; charset=UTF-8');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'content-type');
  return new Response(JSON.stringify(body), { ...init, headers });
}

async function handleInterestSubmission(request: Request, env: Env): Promise<Response> {
  let payload: InterestPayload;
  try {
    const data = await request.json();
    const validation = validateInterestPayload(data);
    if (!validation.valid) {
      return jsonResponse({ message: validation.error }, { status: 400 });
    }
    payload = validation.payload;
  } catch (error) {
    console.error('Invalid interest submission payload', error);
    return jsonResponse({ message: 'Unable to process request body.' }, { status: 400 });
  }

  try {
    await env.DB.prepare(INSERT_INTEREST)
      .bind(payload.name, payload.email, payload.organization, payload.message)
      .run();
  } catch (error) {
    console.error('Failed to store interest submission', error);
    return jsonResponse({ message: 'Failed to record interest right now.' }, { status: 500 });
  }

  return jsonResponse({ message: 'Interest recorded.' }, { status: 201 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/interest') {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: { ...INTEREST_CORS_HEADERS, Allow: 'POST, OPTIONS' },
        });
      }

      if (request.method === 'POST') {
        return handleInterestSubmission(request, env);
      }

      return jsonResponse(
        { message: 'Method Not Allowed' },
        { status: 405, headers: { ...INTEREST_CORS_HEADERS, Allow: 'POST, OPTIONS' } },
      );
    }

    if (url.pathname === '/api/sites') {
      const sites = await fetchSites(env);
      return Response.json(sites);
    }

    if (url.pathname === '/api/next-steps') {
      const sites = await fetchSites(env);
      const nextSteps = determineNextSteps(sites);
      return Response.json({
        nextSteps,
        generatedAt: new Date().toISOString(),
      });
    }

    if (url.pathname === '/api/vision') {
      const sites = await fetchSites(env);
      const assessment = assessDirectoryAgainstVision(sites);
      return Response.json({
        vision: {
          yaml: VISION_YAML,
          config: visionConfig,
        },
        assessment,
        generatedAt: new Date().toISOString(),
      });
    }

    if (url.pathname !== '/' && url.pathname !== '/index.html') {
      return new Response('Not Found', { status: 404 });
    }

    try {
      const sites = await fetchSites(env);
      const html = renderPage(sites);
      return new Response(html, {
        headers: {
          'content-type': 'text/html; charset=UTF-8',
          'cache-control': 'no-store',
        },
      });
    } catch (error) {
      console.error('Failed to load page', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};
