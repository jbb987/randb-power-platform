import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { encode } from './geohash';

interface MobileProvider {
  providerName: string;
  holdingCompany: string;
  providerId: string;
  has3G: boolean;
  has4G: boolean;
  speed4G: string | null;
  has5G: boolean;
  speed5G: string | null;
}

interface MobileBroadbandCacheEntry {
  lat: number;
  lng: number;
  providers: MobileProvider[];
  dataAsOf: string;
  scrapedAt: number;
}

const COLLECTION = 'mobile-broadband-cache';
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export const scrapeMobileBroadband = onCall(
  {
    timeoutSeconds: 120,
    memory: '2GiB',
    region: 'us-central1',
    cors: [/randbpowerinc\.us$/, 'https://platform.randbpowerinc.us'],
  },
  async (request) => {
    // Auth check — only authenticated users
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { lat, lng } = request.data as { lat: number; lng: number };

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new HttpsError('invalid-argument', 'lat and lng must be numbers');
    }

    const db = admin.firestore();
    const cacheKey = encode(lat, lng, 7);

    // 1. Check Firestore cache (with TTL)
    const cached = await db.collection(COLLECTION).doc(cacheKey).get();
    if (cached.exists) {
      const data = cached.data() as MobileBroadbandCacheEntry;
      const age = Date.now() - data.scrapedAt;
      if (age < CACHE_TTL_MS && data.providers.length > 0) {
        console.log(`[Mobile BB] Cache hit for ${cacheKey}`);
        return data;
      }
      console.log(`[Mobile BB] Cache expired or empty for ${cacheKey}, re-scraping...`);
    }

    console.log(`[Mobile BB] Scraping FCC for ${lat}, ${lng}...`);

    // 2. Launch Puppeteer with @sparticuz/chromium
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    try {
      const page = await browser.newPage();

      // Realistic fingerprint
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      );
      await page.setViewport({ width: 1920, height: 1080 });
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });

      // 3. Load FCC broadband map
      await page.goto('https://broadbandmap.fcc.gov/location-summary/mobile', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await delay(4000 + Math.random() * 2000);

      // 4. Switch to Coordinates mode
      try {
        const dropdownBtn = await page.waitForSelector(
          'button::-p-text(Address), button::-p-text(Coordinates)',
          { timeout: 10000 }
        );
        await dropdownBtn!.click();
        await delay(800);
        const coordOption = await page.waitForSelector('::-p-text(Coordinates)', { timeout: 5000 });
        await coordOption!.click();
        await delay(800);
      } catch {
        console.warn('[Mobile BB] Could not switch to Coordinates mode, trying direct input...');
      }

      // 5. Enter coordinates
      let searchInput;
      try {
        searchInput = await page.waitForSelector(
          'input[placeholder="Enter Coordinates"], input[placeholder="Enter Address"]',
          { timeout: 10000 }
        );
      } catch {
        throw new HttpsError('internal', 'Could not find search input on FCC page');
      }

      await searchInput!.click();
      await searchInput!.type(`${lat}, ${lng}`, { delay: 30 });
      await delay(500);
      await searchInput!.press('Enter');

      // 6. Wait for provider data to load
      console.log('[Mobile BB] Waiting for provider data...');
      try {
        await page.waitForFunction(
          () => {
            const text = document.body.innerText;
            return text.includes('AT&T') || text.includes('T-Mobile') || text.includes('Verizon') || text.includes('No mobile broadband');
          },
          { timeout: 20000 }
        );
      } catch {
        // Extra wait if provider detection didn't trigger
        await delay(5000);
      }
      await delay(2000 + Math.random() * 1000);

      // 7. Extract provider table
      const result = await page.evaluate(() => {
        const text = document.body.innerText;

        // Find data-as-of date
        let dataAsOf = '';
        const dateMatch = text.match(/[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}/);
        if (dateMatch) dataAsOf = dateMatch[0];

        const providers: Array<{
          providerName: string;
          holdingCompany: string;
          providerId: string;
          has3G: boolean;
          has4G: boolean;
          speed4G: string | null;
          has5G: boolean;
          speed5G: string | null;
        }> = [];

        // Get all table rows
        const rows = document.querySelectorAll('table tr');

        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td, th'));
          if (cells.length < 2) continue;

          const firstCellText = cells[0]?.textContent?.trim() || '';
          if (firstCellText === 'Provider' || firstCellText === '') continue;

          if (
            firstCellText &&
            !firstCellText.startsWith('Holding') &&
            !firstCellText.startsWith('FRN') &&
            !firstCellText.startsWith('Provider ID')
          ) {
            const fullText = (cells[0] as HTMLElement)?.innerText || '';
            const holdingMatch = fullText.match(/Holding Company:\s*(.+)/);
            const idMatch = fullText.match(/Provider ID:\s*(\d+)/);

            const hasCheckOrSpeed = (cell: Element | undefined): boolean => {
              if (!cell) return false;
              return !!cell.querySelector('svg') || /\d+\/\d+/.test(cell.textContent || '');
            };

            const getSpeed = (cell: Element | undefined): string | null => {
              if (!cell) return null;
              const match = (cell.textContent || '').match(/(\d+\/\d+)/g);
              return match ? match.join(', ') : null;
            };

            providers.push({
              providerName: firstCellText.split('\n')[0].trim(),
              holdingCompany: holdingMatch ? holdingMatch[1].trim() : '',
              providerId: idMatch ? idMatch[1] : '',
              has3G: hasCheckOrSpeed(cells[1]),
              has4G: hasCheckOrSpeed(cells[2]),
              speed4G: getSpeed(cells[2]),
              has5G: hasCheckOrSpeed(cells[3]),
              speed5G: getSpeed(cells[3]),
            });
          }
        }

        return { providers, dataAsOf };
      });

      console.log(`[Mobile BB] Extracted ${result.providers.length} providers`);

      const entry: MobileBroadbandCacheEntry = {
        lat,
        lng,
        providers: result.providers,
        dataAsOf: result.dataAsOf,
        scrapedAt: Date.now(),
      };

      // 8. Only cache if we got actual providers
      if (result.providers.length > 0) {
        await db.collection(COLLECTION).doc(cacheKey).set(entry);
        console.log(`[Mobile BB] Cached as ${cacheKey}`);
      } else {
        console.warn(`[Mobile BB] No providers found for ${lat}, ${lng} — not caching`);
      }

      return entry;
    } finally {
      await browser.close();
    }
  }
);

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
