"use strict";
/**
 * Perplexity enrichment for the Lead Builder pipeline (P4).
 *
 * Given a tax-roll row, identify the OPERATING business at the address and return
 * structured firmographics (operating company, website, description, energy
 * intensity, status). This is triage/judgment work — NOT contact facts (those are
 * Apollo's job, since Perplexity hallucinates phones/emails). Mirrors the validated
 * prototype (enrich_all.py). ~1 sonar call (~1-2¢). Never throws.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrichCompanyPerplexity = enrichCompanyPerplexity;
const v2_1 = require("firebase-functions/v2");
const PPLX_URL = 'https://api.perplexity.ai/chat/completions';
const MODEL = 'sonar';
const SYSTEM = 'You are a precise B2B firmographic researcher. Output ONLY valid JSON, no prose, no code fences.';
const SCHEMA = `
Return ONLY this JSON object. If a field is unknown or you are not confident, use null —
do NOT guess or fabricate. Distinguish the OPERATING business from the property owner.
{
  "operating_company": "business operating at this address (may differ from tax owner)",
  "same_as_tax_owner": true | false | null,
  "status": "active | closed | moved | unknown",
  "website": "primary domain e.g. acme.com, or null",
  "description": "1-2 sentence plain description of what they make/do",
  "industry": "short industry label",
  "naics_guess": "4-6 digit NAICS or null",
  "energy_intensity": "high | medium | low",
  "confidence": "high | medium | low"
}
RULES:
- Use the ADDRESS as the disambiguator; a same-named company elsewhere is NOT a match.
- If it is a multi-tenant industrial park, name the primary operating tenant.
- Never invent a website or NAICS. Null over guess.
- energy_intensity "high" = electricity-heavy (melting, plating, machining, cold storage,
  data center, chemical/process); "low" = plain warehouse/office/storage.
`;
// Sonar often emits the literal string "null"/"none"/"n/a" instead of JSON null
// — treat those as absent so they never become a company name or a "null" domain.
const NULLISH = new Set(['null', 'none', 'n/a', 'na', 'unknown', 'undefined', '-', '']);
function str(v) {
    if (typeof v !== 'string')
        return undefined;
    const t = v.trim();
    return NULLISH.has(t.toLowerCase()) ? undefined : t;
}
async function enrichCompanyPerplexity(company, apiKey) {
    const user = 'Identify the OPERATING BUSINESS at a physical address in New York State. The name ' +
        'comes from a county tax roll and may be a holding company/landlord/LLC that is NOT the ' +
        'operating business — use the ADDRESS as the primary key.\n\n' +
        `INPUT:\n  Tax-roll owner: ${company.taxOwner}\n` +
        `  Site address:   ${company.parcelAddress}, ${company.city}, NY\n` +
        `  Property type:  ${company.classDesc}\n` +
        SCHEMA;
    try {
        const res = await fetch(PPLX_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: MODEL,
                temperature: 0,
                messages: [
                    { role: 'system', content: SYSTEM },
                    { role: 'user', content: user },
                ],
            }),
        });
        if (!res.ok)
            return { pplxError: `HTTP ${res.status}: ${(await res.text()).slice(0, 150)}` };
        const data = (await res.json());
        let content = (data.choices?.[0]?.message?.content ?? '').trim();
        for (const fence of ['```json', '```']) {
            if (content.startsWith(fence))
                content = content.slice(fence.length).trim();
        }
        if (content.endsWith('```'))
            content = content.slice(0, -3).trim();
        const d = JSON.parse(content);
        return {
            operatingCompany: str(d.operating_company),
            sameAsTaxOwner: typeof d.same_as_tax_owner === 'boolean' ? d.same_as_tax_owner : null,
            status: str(d.status),
            website: str(d.website),
            description: str(d.description),
            industry: str(d.industry),
            naics: str(d.naics_guess),
            energyIntensity: str(d.energy_intensity),
            confidence: str(d.confidence),
        };
    }
    catch (err) {
        v2_1.logger.error('[enrichCompanyPerplexity] failed', { err: String(err).slice(0, 150) });
        return { pplxError: String(err).slice(0, 150) };
    }
}
//# sourceMappingURL=perplexity.js.map