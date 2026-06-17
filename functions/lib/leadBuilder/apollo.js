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
exports.orgEnrich = orgEnrich;
exports.findDecisionMaker = findDecisionMaker;
exports.revealPerson = revealPerson;
exports.enrichCompanyApollo = enrichCompanyApollo;
const v2_1 = require("firebase-functions/v2");
const BASE = 'https://api.apollo.io/api/v1';
// The electricity decision-maker by company size, in rough priority order.
// Focused on the people who actually own the power bill / facility load:
// plant / facilities / energy / maintenance / operations + small-co owner/GM.
// Finance (CFO/Controller) and sales/VP titles were dropped — the live test
// surfaced "VP Sales Operations" + "Regional Controller", neither of whom
// makes the electricity decision.
const TITLES = [
    'Owner', 'President', 'CEO', 'General Manager', 'Plant Manager',
    'Facilities Manager', 'Facility Manager', 'Director of Facilities',
    'Energy Manager', 'Maintenance Manager', 'Operations Manager',
    'Director of Operations', 'Plant Engineer', 'COO',
];
// Lower index = better fit when ranking the candidates a search returns.
// Note "operations manager" (specific) not bare "operation" — the latter also
// matched "Sales Operations". Anything matching none of these scores 99 and is
// rejected rather than surfaced (see findDecisionMaker).
const PRIORITY = [
    'facilit', 'energy', 'plant', 'maintenance', 'operations manager',
    'director of operations', 'general manager', 'owner', 'president', 'coo', 'ceo',
];
// Hard exclude — sales/finance/admin titles are never the electricity
// decision-maker, even when they contain a priority substring
// (e.g. "Sales Operations Manager" contains "operations manager").
const EXCLUDE = [
    'sales', 'marketing', 'account', 'business development',
    'human resources', ' hr', 'recruit', 'controller', 'cfo', 'finance',
    'legal', 'counsel', 'procurement', 'purchasing',
];
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
function isExcluded(title) {
    const t = (title ?? '').toLowerCase();
    return EXCLUDE.some((kw) => t.includes(kw));
}
function titleScore(title) {
    const t = (title ?? '').toLowerCase();
    for (let i = 0; i < PRIORITY.length; i++)
        if (t.includes(PRIORITY[i]))
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
    const body = {
        person_titles: TITLES,
        // Don't let Apollo widen our titles via its taxonomy — that's what pulled
        // "VP Sales Operations" in from "Operations Manager". Match our list only.
        include_similar_titles: false,
        page: 1,
        per_page: 10,
    };
    if (opts.orgId)
        body.organization_ids = [opts.orgId];
    else if (opts.domain)
        body.q_organization_domains_list = [opts.domain];
    if (opts.city)
        body.person_locations = [`${opts.city}, New York`, 'New York'];
    let data = await apolloPost('/mixed_people/api_search', body, apiKey);
    let people = data.people ?? [];
    if (people.length === 0 && body.person_locations) {
        delete body.person_locations; // location can over-narrow — retry unfiltered
        data = await apolloPost('/mixed_people/api_search', body, apiKey);
        people = data.people ?? [];
    }
    // Drop sales/finance/admin titles outright, then rank the rest. A candidate
    // matching none of our priority keywords (score 99) is off-target — return
    // null rather than qualify the wrong person (strict bar: no DM > wrong DM).
    const ranked = people
        .filter((p) => !isExcluded(p.title))
        .sort((a, b) => titleScore(a.title) - titleScore(b.title));
    if (ranked.length === 0 || titleScore(ranked[0].title) === 99)
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
        const person = await findDecisionMaker({ orgId: org?.id, domain, city: company.city }, apiKey);
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