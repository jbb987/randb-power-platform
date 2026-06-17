"use strict";
/**
 * Apollo enrichment for the Lead Builder pipeline (P3).
 *
 * Given a company with a website domain, find the electricity decision-maker and
 * their verified work email via Apollo:
 *   org-enrich  ->  people api_search (target titles, NY-biased)  ->  people/match (reveal email)
 * Mirrors the validated prototype (apollo_test.py). Mobile numbers are NOT pulled
 * here — those are revealed on-demand per lead via revealLeadPhone after promotion
 * (the 8-credit step stays just-in-time). Cost here ≈ 1 (org) + 1 (match/email) credits.
 *
 * Pure logic + a thin Apollo client. The pipeline processor binds APOLLO_API_KEY
 * and calls enrichCompanyApollo() per company — no public HTTP surface.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.domainOf = domainOf;
exports.orgEnrich = orgEnrich;
exports.findDecisionMaker = findDecisionMaker;
exports.revealPerson = revealPerson;
exports.enrichCompanyApollo = enrichCompanyApollo;
const v2_1 = require("firebase-functions/v2");
const BASE = 'https://api.apollo.io/api/v1';
// Tier-aware decision-maker targeting. A BIG/GIANT plant has facilities/energy/
// plant staff; a SMALL business usually doesn't — there the owner/GM, and
// failing that the controller/CFO, signs off on the power bill. So SMALL gets a
// broader acceptable set and keeps finance as a last resort; BIG/GIANT stay
// strictly operational.
// Strict core (all tiers): the people who actually own facility load.
const TITLES_CORE = [
    'Owner', 'President', 'CEO', 'General Manager', 'Plant Manager',
    'Facilities Manager', 'Facility Manager', 'Director of Facilities',
    'Energy Manager', 'Maintenance Manager', 'Operations Manager',
    'Director of Operations', 'Plant Engineer', 'COO',
];
const TITLES_SMALL_EXTRA = [
    'Vice President', 'VP Operations', 'Controller', 'CFO',
    'Chief Financial Officer', 'Managing Member', 'Principal', 'Partner',
];
// Lower index = better fit when ranking. "operations manager" (specific) not
// bare "operation" — the latter also matched "Sales Operations". A candidate
// matching none scores 99 and is rejected.
const PRIORITY_CORE = [
    'facilit', 'energy', 'plant', 'maintenance', 'operations manager',
    'director of operations', 'general manager', 'owner', 'president', 'coo', 'ceo',
];
const PRIORITY_SMALL_EXTRA = [
    'vice president', 'vp ', 'controller', 'cfo', 'chief financial',
    'managing member', 'principal', 'partner',
];
// Never the electricity decision-maker, at any size.
const EXCLUDE_BASE = [
    'sales', 'marketing', 'account', 'business development',
    'human resources', ' hr', 'recruit', 'legal', 'counsel',
    'procurement', 'purchasing',
];
// Finance excluded for big firms (they have facilities staff) but allowed as a
// last resort for SMALL, where the controller is often the only signoff.
const EXCLUDE_FINANCE = ['controller', 'cfo', 'finance'];
/** Title-matching config for a company's tier. */
function titleConfig(tier) {
    const small = tier === 'SMALL';
    return {
        titles: small ? [...TITLES_CORE, ...TITLES_SMALL_EXTRA] : TITLES_CORE,
        priority: small ? [...PRIORITY_CORE, ...PRIORITY_SMALL_EXTRA] : PRIORITY_CORE,
        exclude: small ? EXCLUDE_BASE : [...EXCLUDE_BASE, ...EXCLUDE_FINANCE],
    };
}
function authHeaders(apiKey) {
    return { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': apiKey };
}
async function apolloPost(path, body, apiKey) {
    const res = await fetch(BASE + path, {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify(body),
    });
    if (!res.ok)
        throw new Error(`Apollo POST ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
}
async function apolloGet(path, apiKey) {
    const res = await fetch(BASE + path, { method: 'GET', headers: authHeaders(apiKey) });
    if (!res.ok)
        throw new Error(`Apollo GET ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
}
function domainOf(website) {
    if (!website)
        return undefined;
    return (website
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '')
        .trim() || undefined);
}
function isExcluded(title, exclude) {
    const t = (title ?? '').toLowerCase();
    return exclude.some((kw) => t.includes(kw));
}
function titleScore(title, priority) {
    const t = (title ?? '').toLowerCase();
    for (let i = 0; i < priority.length; i++)
        if (t.includes(priority[i]))
            return i;
    return 99;
}
/** Org enrichment: firmographics + main phone + org id (≈1 credit). */
async function orgEnrich(domain, apiKey) {
    const data = await apolloGet(`/organizations/enrich?domain=${encodeURIComponent(domain)}`, apiKey);
    return data.organization ?? null;
}
/**
 * People search by org (or domain) + target titles; returns the best-fit person
 * (free, name/email masked). NY-biased for multi-site parents, with a fallback
 * to the unfiltered search if the location filter over-narrows.
 */
async function findDecisionMaker(opts, apiKey) {
    const { titles, priority, exclude } = titleConfig(opts.tier);
    const common = {
        person_titles: titles,
        // Don't let Apollo widen our titles via its taxonomy — that's what pulled
        // "VP Sales Operations" in from "Operations Manager". Match our list only.
        include_similar_titles: false,
        page: 1,
        per_page: 10,
    };
    const locations = opts.city ? [`${opts.city}, New York`, 'New York'] : undefined;
    // Run one org filter; location-biased first, then unfiltered if it over-narrows.
    const search = async (orgFilter) => {
        let d = await apolloPost('/mixed_people/api_search', locations ? { ...common, ...orgFilter, person_locations: locations } : { ...common, ...orgFilter }, apiKey);
        let people = d.people ?? [];
        if (people.length === 0 && locations) {
            d = await apolloPost('/mixed_people/api_search', { ...common, ...orgFilter }, apiKey);
            people = d.people ?? [];
        }
        return people;
    };
    // Try org id → domain → company NAME. The name fallback recovers companies
    // whose Perplexity-resolved domain Apollo doesn't index (e.g. Cargill returns
    // cargillsalt.com, which Apollo lists under cargill.com / "Cargill Salt").
    let people = [];
    if (opts.orgId)
        people = await search({ organization_ids: [opts.orgId] });
    if (people.length === 0 && opts.domain)
        people = await search({ q_organization_domains_list: [opts.domain] });
    if (people.length === 0 && opts.companyName)
        people = await search({ q_organization_name: opts.companyName });
    // Drop excluded titles, rank the rest. A candidate matching none of our
    // priority keywords (score 99) is off-target — return null rather than
    // qualify the wrong person (strict bar: no DM > wrong DM).
    const ranked = people
        .filter((p) => !isExcluded(p.title, exclude))
        .sort((a, b) => titleScore(a.title, priority) - titleScore(b.title, priority));
    if (ranked.length === 0 || titleScore(ranked[0].title, priority) === 99)
        return null;
    return ranked[0];
}
/** Reveal the person's verified work email + name + LinkedIn (people/match, ≈1 credit). */
async function revealPerson(personId, apiKey) {
    const data = await apolloPost('/people/match', { id: personId, reveal_personal_emails: true }, apiKey);
    return data.person ?? null;
}
/**
 * Full Apollo enrichment for one pipeline company. Never throws — returns a
 * structured result (qualified=false + apolloError on failure) so the processor
 * can mark the row dropped_apollo and move on.
 */
async function enrichCompanyApollo(company, apiKey) {
    const domain = domainOf(company.website);
    if (!domain)
        return { qualified: false, apolloError: 'no domain' };
    try {
        const org = await orgEnrich(domain, apiKey);
        const person = await findDecisionMaker({ orgId: org?.id, domain, companyName: company.operatingCompany, city: company.city, tier: company.tier }, apiKey);
        const orgPhone = org?.phone ?? org?.sanitized_phone;
        if (!person?.id) {
            return {
                apolloOrgId: org?.id,
                orgPhone,
                orgEmployees: org?.estimated_num_employees,
                qualified: false,
            };
        }
        const revealed = await revealPerson(person.id, apiKey);
        const name = revealed?.name ?? person.name;
        const email = revealed?.email;
        return {
            apolloOrgId: org?.id,
            apolloPersonId: person.id,
            decisionMaker: name,
            decisionMakerTitle: revealed?.title ?? person.title,
            email,
            linkedinUrl: revealed?.linkedin_url,
            orgPhone,
            orgEmployees: org?.estimated_num_employees,
            qualified: Boolean(name && email),
        };
    }
    catch (err) {
        v2_1.logger.error('[enrichCompanyApollo] failed', { domain, err: String(err).slice(0, 200) });
        return { qualified: false, apolloError: String(err).slice(0, 200) };
    }
}
//# sourceMappingURL=apollo.js.map