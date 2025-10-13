/**
 * Convert a URL to a canonical key for consistent matching
 * Examples:
 * - "https://www.slack.com/" -> "slack.com"
 * - "https://atlassian.com/company" -> "atlassian.com"
 * - "slack.com" -> "slack.com"
 */
export function toUrlKey(input: string): string {
  try {
    const u = new URL(input.trim());
    const host = u.hostname.replace(/^www\./, '');
    return host;
  } catch {
    // If not a full URL, try to extract domain
    return input.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  }
}

/**
 * Resolve company entity from URL and company card data
 */
export function resolveCompanyEntity(urlKey: string, companyCard: any) {
  // Generate brand name from domain
  const brandFromDomain = urlKey
    .split('.')[0]
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
  
  // Prefer company card name if available and reasonable length
  const brand = (companyCard?.name && companyCard.name.length <= 60) 
    ? companyCard.name 
    : brandFromDomain;
  
  // Generate aliases for matching
  const aliases = [
    brand,
    brand + ' Technologies',
    brand + 'HQ',
    urlKey
  ].filter((v, i, a) => a.indexOf(v) === i); // dedupe
  
  return { brand, domain: urlKey, aliases };
}
