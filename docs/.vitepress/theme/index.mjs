import { inBrowser } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import './foldSections.css';

// A heading inside a collapsed section has no layout box, so the router's scroll to it would
// land nowhere: open every <details> around the target first. VitePress dispatches hashchange
// before it scrolls on a same-page link, and awaits onAfterPageLoad before it scrolls after
// router.go (a search result).
function revealHash(hash) {
    let target;
    try {
        target = document.getElementById(decodeURIComponent(hash.slice(1)));
    } catch {
        return;
    }
    for (let details = target?.closest('details'); details;) {
        details.open = true;
        details = details.parentElement.closest('details');
    }
}

export default {
    extends: DefaultTheme,
    enhanceApp({ router }) {
        if (!inBrowser) return;
        window.addEventListener('hashchange', () => revealHash(location.hash));
        router.onAfterPageLoad = (href) => revealHash(new URL(href, location.href).hash);
    },
};
