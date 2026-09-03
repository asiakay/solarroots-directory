import template from './templates/index.html';

type SiteRecord = {
  id: number;
  name: string;
  description: string | null;
  website: string | null;
  tags: string[];
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
  if (!sites.length) {
    return template.replace(
      '{{siteCards}}',
      `
        <article class="site-card">
          <h2>No entries yet</h2>
          <p>Add a site by running a new D1 migration or using the API at <code>/api/sites</code>.</p>
        </article>
      `.trim(),
    );
  }

  const cards = sites.map(renderSiteCard).join('\n');
  return template.replace('{{siteCards}}', cards);
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
