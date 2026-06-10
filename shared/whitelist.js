export const WHITELIST_KEY = 'whitelistDomains';
export const MAX_WHITELIST_DOMAINS = 20;

const DOMAIN_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function normalizeWhitelistDomain(hostname) {
  return hostname.trim().toLowerCase().replace(/^www\./, '');
}

export function isValidHostname(hostname) {
  if (!hostname || hostname.length > 253) return false;
  if (hostname === 'localhost') return true;
  return DOMAIN_PATTERN.test(hostname);
}

export function parseWhitelistEntry(input) {
  const trimmed = input.trim();

  if (!trimmed) {
    return { valid: false, error: 'Enter a domain or URL.' };
  }

  let hostname;

  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { valid: false, error: 'Only http:// and https:// URLs are supported.' };
      }

      if (url.username || url.password) {
        return { valid: false, error: 'URLs with credentials are not supported.' };
      }

      hostname = url.hostname;
    } else if (trimmed.includes('/') || trimmed.includes('?') || trimmed.includes('#')) {
      return { valid: false, error: 'Enter a valid domain or full URL (e.g. example.com).' };
    } else {
      hostname = trimmed;
    }
  } catch {
    return { valid: false, error: 'Enter a valid domain or URL (e.g. example.com).' };
  }

  if (!isValidHostname(hostname)) {
    return {
      valid: false,
      error: 'Enter a valid domain name (e.g. example.com or mail.google.com).',
    };
  }

  return { valid: true, domain: normalizeWhitelistDomain(hostname) };
}

export function normalizeWhitelist(domains) {
  if (!Array.isArray(domains)) return [];

  const seen = new Set();
  const normalized = [];

  for (const entry of domains) {
    const parsed = parseWhitelistEntry(String(entry));

    if (!parsed.valid || seen.has(parsed.domain)) continue;

    seen.add(parsed.domain);
    normalized.push(parsed.domain);

    if (normalized.length >= MAX_WHITELIST_DOMAINS) break;
  }

  return normalized;
}

export function isHostnameWhitelisted(hostname, whitelist) {
  if (!hostname || !Array.isArray(whitelist) || whitelist.length === 0) return false;

  const host = hostname.toLowerCase();
  const bareHost = host.replace(/^www\./, '');

  return whitelist.some((entry) => {
    const domain = entry.toLowerCase();

    return (
      bareHost === domain ||
      host === domain ||
      host === `www.${domain}` ||
      bareHost.endsWith(`.${domain}`)
    );
  });
}

export function validateWhitelistAddition(input, existingDomains) {
  const parsed = parseWhitelistEntry(input);

  if (!parsed.valid) {
    return parsed;
  }

  const normalizedExisting = normalizeWhitelist(existingDomains);

  if (normalizedExisting.includes(parsed.domain)) {
    return { valid: false, error: `${parsed.domain} is already on the whitelist.` };
  }

  if (normalizedExisting.length >= MAX_WHITELIST_DOMAINS) {
    return { valid: false, error: `You can whitelist up to ${MAX_WHITELIST_DOMAINS} domains.` };
  }

  return { valid: true, domain: parsed.domain };
}

export function getContentSettingPatterns(domain) {
  return [`*://${domain}/*`, `*://*.${domain}/*`];
}
