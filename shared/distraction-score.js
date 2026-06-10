export const BLOCK_HISTORY_KEY = 'blockHistory';

export function emptyBlockHistory() {
  return { total: 0, bySite: {} };
}

export function normalizeBlockedHostname(hostname) {
  return (hostname || 'unknown').trim().toLowerCase();
}

export function buildDistractionScores(history = emptyBlockHistory()) {
  if (!history.total) {
    return { total: 0, domains: [] };
  }

  const domains = Object.entries(history.bySite)
    .map(([domain, count]) => {
      const score = Math.round((count / history.total) * 1000) / 10;

      return {
        domain,
        count,
        score,
        level: getDistractionLevel(score),
      };
    })
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));

  return { total: history.total, domains };
}

export function getDistractionLevel(score) {
  if (score >= 40) return 'high';
  if (score >= 15) return 'medium';
  return 'low';
}
