"use strict";
/**
 * Google News RSS source. Free, keyless. US-scoped via gl=US&ceid=US:en and the
 * `when:` recency operator. Each query is an RSS search feed.
 *
 * Note: item links are news.google.com redirect URLs, so the same story won't
 * URL-dedup against the GDELT/RSS copy — UI clusters those by titleKey instead.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchGoogleNews = fetchGoogleNews;
const rss_parser_1 = __importDefault(require("rss-parser"));
const v2_1 = require("firebase-functions/v2");
const util_1 = require("../util");
const config_1 = require("./config");
const parser = new rss_parser_1.default({ timeout: 15000 });
/** Google News headlines are "Headline - Publisher" — peel off the publisher. */
function splitPublisher(title) {
    const idx = title.lastIndexOf(' - ');
    if (idx > 0 && idx > title.length - 60) {
        return { title: title.slice(0, idx).trim(), publisher: title.slice(idx + 3).trim() };
    }
    return { title };
}
async function fetchGoogleNews() {
    const out = [];
    for (const q of config_1.GOOGLE_NEWS_QUERIES) {
        try {
            const url = 'https://news.google.com/rss/search' +
                `?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
            const parsed = await parser.parseURL(url);
            for (const item of parsed.items) {
                if (!item.link || !item.title)
                    continue;
                const { title, publisher } = splitPublisher(item.title);
                out.push({
                    title,
                    url: item.link,
                    source: 'google-news',
                    sourceName: publisher || 'Google News',
                    summary: item.contentSnippet || undefined,
                    publishedAt: (0, util_1.parseTimestamp)(item.isoDate),
                });
            }
        }
        catch (err) {
            v2_1.logger.warn('fetchGoogleNews: query failed', err);
        }
    }
    return out;
}
//# sourceMappingURL=googleNews.js.map