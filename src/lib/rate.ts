/** Looking up the dollar-to-rand rate.
 *
 *  Free, no key, no sign-up, and both send CORS headers so the browser can call
 *  them directly. Two of them, because a single free endpoint going down should
 *  not take the feature with it.
 *
 *  This will not work everywhere. Some hosts block outside requests entirely —
 *  a page served under a strict content policy, for instance. When that happens
 *  the lookup fails, the app keeps whatever rate it already had, and the
 *  Settings page says so rather than pretending the number is fresh.
 */

const SOURCES: Array<{ url: string; read: (json: unknown) => number | null }> = [
  {
    url: 'https://open.er-api.com/v6/latest/USD',
    read: (json) => {
      const rates = (json as { rates?: Record<string, number> })?.rates;
      return typeof rates?.ZAR === 'number' ? rates.ZAR : null;
    },
  },
  {
    url: 'https://api.frankfurter.app/latest?from=USD&to=ZAR',
    read: (json) => {
      const rates = (json as { rates?: Record<string, number> })?.rates;
      return typeof rates?.ZAR === 'number' ? rates.ZAR : null;
    },
  },
];

export interface RateLookup {
  rate: number;
  fetchedAt: string;
}

/** Ask each source in turn and take the first sensible answer.
 *
 *  A rate outside 1-1000 is rejected: it would mean the endpoint changed shape
 *  or returned a different currency pair, and silently adopting it would put
 *  every converted figure in the app out by orders of magnitude. */
export async function fetchUsdZarRate(timeoutMs = 6000): Promise<RateLookup | null> {
  for (const source of SOURCES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(source.url, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) continue;

      const rate = source.read(await response.json());
      if (rate === null || !Number.isFinite(rate) || rate <= 1 || rate >= 1000) continue;

      return { rate: Math.round(rate * 10000) / 10000, fetchedAt: new Date().toISOString().slice(0, 10) };
    } catch {
      // Blocked, offline, or timed out. Try the next one.
    }
  }
  return null;
}
