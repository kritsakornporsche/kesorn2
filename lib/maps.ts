// Google Maps for the dorm (commit 27b) — the keyless embed (maps.google.com/maps?…&output=embed), no API key or Map ID.
// The map link set on the settings page is often a short link (maps.app.goo.gl/…). The embed cannot open a short link:
// passing it as the search text showed a world map with "Some custom on-map content could not be displayed". So:
//  - a link with coordinates (@lat,lng or !3d…!4d…) → embed at those coordinates
//  - a link with a q / query parameter or a /place/<name> path → embed that search
//  - a short link → resolved on the server (resolveMapUrl, follows the redirect once, cached) and read the same way
//  - otherwise → search for the dorm name + address. A URL is never used as the search text.

const embed = (q: string, zoom: number) => `https://maps.google.com/maps?q=${encodeURIComponent(q)}&t=&z=${zoom}&ie=UTF8&iwloc=&output=embed`;

/** Coordinates in a Google Maps link: the place pin (!3d…!4d…) first, else the view centre (@lat,lng), else "lat,lng". */
export function coordinatesIn(link: string): { lat: string; lng: string } | null {
  const pin = link.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (pin) return { lat: pin[1], lng: pin[2] };
  const at = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) return { lat: at[1], lng: at[2] };
  const plain = link.match(/(?:^|[^\d.])(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})/);
  if (plain) return { lat: plain[1], lng: plain[2] };
  return null;
}

export const isShortMapLink = (link: string | null | undefined) => /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(String(link ?? '').trim());

/** The embed URL for the dorm map. `mapUrl` may already be resolved by resolveMapUrl (server). */
export function mapEmbedUrl(mapUrl: string | null | undefined, address?: string | null, dormName?: string | null): string {
  const link = String(mapUrl ?? '').trim();
  if (link) {
    if (link.includes('/maps/embed') || link.includes('output=embed')) return link;
    const c = coordinatesIn(link);
    if (c) return embed(`${c.lat},${c.lng}`, 17);
    try {
      const url = new URL(link);
      const q = url.searchParams.get('q') || url.searchParams.get('query');
      if (q && !/^https?:/i.test(q)) return embed(q, 16);
      const place = url.pathname.match(/\/maps\/place\/([^/]+)/);
      if (place) return embed(decodeURIComponent(place[1]).replace(/\+/g, ' '), 16);
    } catch {
      // not a URL: a typed place name / address
      if (!/^https?:/i.test(link)) return embed(link, 16);
    }
  }
  return embed([dormName, address].filter(Boolean).join(' ') || 'พะเยา', 15);
}

/** The link to open in Google Maps (the owner's link as it is, or a search for the dorm). */
export function mapDirectUrl(mapUrl: string | null | undefined, address?: string | null, dormName?: string | null): string {
  const link = String(mapUrl ?? '').trim();
  if (link && /^https?:/i.test(link) && !link.includes('/embed')) return link;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([dormName, address].filter(Boolean).join(' ') || 'พะเยา')}`;
}

const resolved = new Map<string, { at: number; url: string }>();
const DAY = 24 * 60 * 60 * 1000;

/** Server only: a short link → the full Google Maps URL it redirects to (cached a day). Anything else is returned as is. */
export async function resolveMapUrl(mapUrl: string | null | undefined): Promise<string | null> {
  const link = String(mapUrl ?? '').trim();
  if (!link || !isShortMapLink(link)) return link || null;
  const hit = resolved.get(link);
  if (hit && Date.now() - hit.at < DAY) return hit.url;
  try {
    const res = await fetch(link, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(4000) });
    const location = res.headers.get('location');
    if (location && /^https:\/\/(www\.)?google\.[a-z.]+\/maps/i.test(location)) {
      resolved.set(link, { at: Date.now(), url: location });
      return location;
    }
  } catch (error: any) {
    console.warn('[maps] short link not resolved:', error?.message || error);
  }
  return link; // mapEmbedUrl then falls back to the dorm name + address
}
