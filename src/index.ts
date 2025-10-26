import template from './templates/index.html';

type SiteRecord = {
  id: number;
  name: string;
  description: string | null;
  website: string | null;
  tags: string[];
};

type NextStep = {
  id: string;
  title: string;
  description: string;
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

function renderPage(sites: SiteRecord[]): string {
  const cards = sites.length
    ? sites.map(renderSiteCard).join('\n')
    : `
        <article class="site-card">
          <h2>No entries yet</h2>
          <p>Add a site by running a new D1 migration or using the API at <code>/api/sites</code>.</p>
        </article>
      `.trim();

  const nextSteps = determineNextSteps(sites);
  const nextStepsMarkup = renderNextSteps(nextSteps);

  return template
    .replace('{{siteCards}}', cards)
    .replace('{{nextSteps}}', nextStepsMarkup);
}

function determineNextSteps(sites: SiteRecord[]): NextStep[] {
  const steps: NextStep[] = [];
  const seen = new Set<string>();

  const addStep = (step: NextStep) => {
    if (seen.has(step.id)) {
      return;
    }
    seen.add(step.id);
    steps.push(step);
  };

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
    } else if (tagSet.size < Math.max(3, sites.length)) {
      addStep({
        id: 'expand-taxonomy',
        title: 'Expand your tagging taxonomy',
        description:
          'Broaden the tag set with additional topics so the directory can filter and group projects more effectively.',
      });
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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
