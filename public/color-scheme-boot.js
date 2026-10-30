// Stamps the colour scheme on <html> before the first paint, so a dark preference
// paints the cold-start skeleton and the chooser dark from the first frame. A
// blocking classic script in <head>: the bundle is a deferred module and runs
// after the first paint, and the CSP forbids an inline script. Unbundled, so it
// repeats the storage key, the ids and the resolution of colorSchemeService.js
// (packages/modules/src/common/services/), which re-stamps the same value on init
// and owns the scheme from then on. Keep the two in step.
(function () {
    var stored = null;
    try {
        stored = localStorage.getItem('tba3_color_scheme');
    } catch (e) {
        // localStorage unavailable: follow the OS, as `system` does.
    }
    var dark =
        stored === 'dark' ||
        (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.colorScheme = dark ? 'dark' : 'light';
})();
