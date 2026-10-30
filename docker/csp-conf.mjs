/**
 * Print the nginx `map` that picks the Content-Security-Policy per part of the site, from
 * config/csp.mjs. The image build writes it next to nginx.conf (Dockerfile), so the
 * header never holds a copy of the policy. The handbook (VitePress) ships inline scripts
 * and styles, the dashboards none.
 */

import { DASHBOARD_CSP, DOCS_CSP } from '../config/csp.mjs';

process.stdout.write(`map $uri $content_security_policy {
    ~^/docs/ "${DOCS_CSP}";
    default "${DASHBOARD_CSP}";
}
`);
