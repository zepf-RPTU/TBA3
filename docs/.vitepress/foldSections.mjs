// Folds every top-level `##` section into a native `<details open>` whose summary is the h2,
// so a reader can collapse it. A top-level h1 ends the open section too. Headings nested in a
// list, quote or `:::` container (token level > 0) are left alone.
export function foldSections(md) {
    md.core.ruler.push('fold_sections', (state) => {
        const html = (content) => {
            const token = new state.Token('html_block', '', 0);
            token.content = content;
            return token;
        };
        const isTopHeading = (token, type, tags) =>
            token.type === type && token.level === 0 && tags.includes(token.tag);

        const tokens = [];
        let open = false;
        for (const token of state.tokens) {
            if (open && isTopHeading(token, 'heading_open', ['h1', 'h2'])) {
                tokens.push(html('</details>\n'));
                open = false;
            }
            if (isTopHeading(token, 'heading_open', ['h2'])) {
                tokens.push(html('<details class="doc-section" open>\n<summary>'));
                open = true;
            }
            tokens.push(token);
            if (isTopHeading(token, 'heading_close', ['h2'])) tokens.push(html('</summary>\n'));
        }
        if (open) tokens.push(html('</details>\n'));
        state.tokens = tokens;
    });
}
