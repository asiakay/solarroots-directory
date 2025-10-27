import { parse } from 'yaml';
import type { SiteRecord } from '../types/directory';
import visionYaml from '../../config/vision.yaml?raw';

export interface VisionPillar {
  id: string;
  title: string;
  description: string;
}

export interface VisionConfig {
  mission: string;
  pillars: VisionPillar[];
  directory_targets: {
    minimum_sites: number;
    minimum_tag_density: number;
    recommended_tags: string[];
    storytelling_focus: string[];
  };
}

export interface VisionAssessmentMetrics {
  siteCount: number;
  minimumSites: number;
  meetsMinimumSites: boolean;
  totalTags: number;
  averageTagsPerSite: number;
  minimumTagDensity: number;
  meetsMinimumTagDensity: boolean;
  recommendedTags: string[];
  presentRecommendedTags: string[];
  missingRecommendedTags: string[];
  coverageRatio: number;
}

export interface VisionAssessment {
  metrics: VisionAssessmentMetrics;
  storytellingFocus: string[];
  opportunities: string[];
  progressScore: number;
}

export const VISION_YAML = visionYaml.trim();

export const visionConfig = Object.freeze(parse(VISION_YAML) as VisionConfig);

export function assessDirectoryAgainstVision(sites: ReadonlyArray<SiteRecord>): VisionAssessment {
  const { minimum_sites, minimum_tag_density, recommended_tags, storytelling_focus } =
    visionConfig.directory_targets;

  const siteCount = sites.length;
  let totalTags = 0;
  const tagOccurrences = new Map<string, number>();

  for (const site of sites) {
    for (const tag of site.tags) {
      totalTags += 1;
      tagOccurrences.set(tag, (tagOccurrences.get(tag) ?? 0) + 1);
    }
  }

  const averageTagsPerSite = siteCount === 0 ? 0 : totalTags / siteCount;

  const presentRecommendedTags: string[] = [];
  const missingRecommendedTags: string[] = [];

  for (const tag of recommended_tags) {
    if (tagOccurrences.has(tag)) {
      presentRecommendedTags.push(tag);
    } else {
      missingRecommendedTags.push(tag);
    }
  }

  const coverageRatio = recommended_tags.length
    ? presentRecommendedTags.length / recommended_tags.length
    : 1;

  const meetsMinimumSites = siteCount >= minimum_sites;
  const meetsMinimumTagDensity =
    minimum_tag_density <= 0 ? true : averageTagsPerSite >= minimum_tag_density;

  const metrics: VisionAssessmentMetrics = {
    siteCount,
    minimumSites: minimum_sites,
    meetsMinimumSites,
    totalTags,
    averageTagsPerSite,
    minimumTagDensity: minimum_tag_density,
    meetsMinimumTagDensity,
    recommendedTags: [...recommended_tags],
    presentRecommendedTags,
    missingRecommendedTags,
    coverageRatio,
  };

  const opportunities = new Set<string>();

  if (!meetsMinimumSites && minimum_sites > 0) {
    const remaining = minimum_sites - siteCount;
    const entryWord = remaining === 1 ? 'entry' : 'entries';
    opportunities.add(
      `Publish ${remaining} more directory ${entryWord} to reach the SolarRoots minimum of ${minimum_sites}.`,
    );
  }

  if (!meetsMinimumTagDensity && minimum_tag_density > 0) {
    opportunities.add(
      `Increase the average tags per site to at least ${minimum_tag_density.toFixed(1)} (currently ${averageTagsPerSite.toFixed(
        1,
      )}) by documenting more dimensions of each cooperative.`,
    );
  }

  if (missingRecommendedTags.length) {
    opportunities.add(
      `Introduce tags for ${formatList(missingRecommendedTags)} so the directory reflects SolarRoots focus areas.`,
    );
  }

  if (storytelling_focus.length) {
    opportunities.add(
      `Collect narratives covering ${formatList(
        storytelling_focus,
      )} to stay aligned with the SolarRoots storytelling focus.`,
    );
  }

  const normalizedProgressFactors = [
    minimum_sites > 0 ? Math.min(siteCount / minimum_sites, 1) : 1,
    minimum_tag_density > 0 ? Math.min(averageTagsPerSite / minimum_tag_density, 1) : 1,
    coverageRatio,
  ];

  const progressScore = Number(
    ((normalizedProgressFactors.reduce((sum, value) => sum + value, 0) /
      normalizedProgressFactors.length) *
      100)
      .toFixed(1),
  );

  return {
    metrics,
    storytellingFocus: [...storytelling_focus],
    opportunities: Array.from(opportunities),
    progressScore,
  };
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

  const allButLast = items.slice(0, -1).join(', ');
  const last = items[items.length - 1];
  return `${allButLast}, and ${last}`;
}
