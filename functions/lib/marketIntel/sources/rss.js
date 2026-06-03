"use strict";
/**
 * Trade-press RSS source. These feeds only cover data-center industry news, so
 * they're high-signal — we keep all parseable items and let the keyword filter
 * (and per-item state tagging) decide what's a US deal downstream.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchRss = fetchRss;
const rss_parser_1 = __importDefault(require("rss-parser"));
const v2_1 = require("firebase-functions/v2");
const util_1 = require("../util");
const config_1 = require("./config");
const parser = new rss_parser_1.default({ timeout: 15000 });
async function fetchRss() {
    const out = [];
    for (const feed of config_1.RSS_FEEDS) {
        try {
            const parsed = await parser.parseURL(feed.url);
            for (const item of parsed.items) {
                if (!item.link || !item.title)
                    continue;
                out.push({
                    title: item.title,
                    url: item.link,
                    source: 'rss',
                    sourceName: feed.name,
                    summary: item.contentSnippet || item.content || undefined,
                    publishedAt: (0, util_1.parseTimestamp)(item.isoDate),
                });
            }
        }
        catch (err) {
            // One bad feed must not kill the rest.
            v2_1.logger.warn(`fetchRss: feed failed — ${feed.name}`, err);
        }
    }
    return out;
}
//# sourceMappingURL=rss.js.map