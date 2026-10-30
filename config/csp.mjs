/**
 * The Content-Security-Policy of the built site, in one place.
 *
 * Two carriers serve it: the nginx image sends it as a header (docker/csp-conf.mjs writes
 * the nginx `map` from this file at image build), and the build writes it into each dashboard
 * page as a `<meta>` tag (vite.config.js) for hosts that cannot set headers — GitHub
 * Pages and `vite preview`. The dev server gets neither:
 * it serves inline module scripts and injects `<style>` elements.
 */

/**
 * Hosts the `?api=` override may point at besides the page's own origin; `connect-src`
 * allows the same. CSP cannot express an IPv6 literal, so `[::1]` is not among them.
 */
export const LOOPBACK_HOSTS = ['localhost', '127.0.0.1'];

const LOOPBACK_SOURCES = LOOPBACK_HOSTS.flatMap((host) => [
    `http://${host}:*`,
    `https://${host}:*`,
]);

/**
 * The dashboards and the chooser. Here and in the handbook, every fetch directive not
 * listed falls back to `default-src 'self'`.
 * - No inline script or style at all, and no `style` attribute: values computed at run
 *   time go through CSSOM, which the policy does not govern.
 * - `data:` images for the favicon and html-to-image's export rendering, `blob:` for the
 *   report's captured cards.
 * - Trusted Types: HTML strings reach a sink only through the `tba3` policy
 *   (`setTrustedHTML`, `trusted()`) or the sanitizing `default` one; `dompurify` is the
 *   policy DOMPurify makes for its own parsing, `lit-html` the one lit-html makes for its
 *   template strings (static source text, never data).
 * @type {Array<[string, ...string[]]>}
 */
const DASHBOARD_DIRECTIVES = [
    ['default-src', "'self'"],
    ['img-src', "'self'", 'data:', 'blob:'],
    ['connect-src', "'self'", ...LOOPBACK_SOURCES],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
    ['require-trusted-types-for', "'script'"],
    ['trusted-types', 'tba3', 'default', 'dompurify', 'lit-html'],
];

/**
 * The VitePress handbook under /docs/: static pages with no data in them, whose theme
 * ships inline scripts (the colour-scheme check) and inline styles. `'unsafe-inline'`
 * is kept on purpose: every page is built from the repository and takes no input, so
 * there is nothing to inject through, and hashing the theme's scripts would tie the
 * policy to each VitePress release.
 * @type {Array<[string, ...string[]]>}
 */
const DOCS_DIRECTIVES = [
    ['default-src', "'self'"],
    ['script-src', "'self'", "'unsafe-inline'"],
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'data:'],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
];

/**
 * @param {Array<[string, ...string[]]>} directives - Name first, then its sources.
 * @returns {string} The policy as a header value.
 */
function serialize(directives) {
    return directives.map((directive) => directive.join(' ')).join('; ');
}

/** The dashboards' policy as the nginx header sends it. */
export const DASHBOARD_CSP = serialize(DASHBOARD_DIRECTIVES);

/** The handbook's policy as the nginx header sends it. */
export const DOCS_CSP = serialize(DOCS_DIRECTIVES);

/**
 * The dashboards' policy for a `<meta>` tag: without `frame-ancestors`, which a browser
 * ignores there (and warns about) — framing protection needs the header.
 */
export const DASHBOARD_META_CSP = serialize(
    DASHBOARD_DIRECTIVES.filter(([name]) => name !== 'frame-ancestors'),
);
