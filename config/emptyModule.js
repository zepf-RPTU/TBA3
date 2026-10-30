/**
 * Stand-in for jsPDF's `html()` optional dependencies html2canvas and canvg.
 * Nothing in the repo calls `jsPDF.prototype.html()` — rasterisation goes through
 * html-to-image in `src/common/export/exportCapture.js` — so `vite.config.js` aliases the
 * two dynamic imports here and no chunk is emitted for them.
 */
export default {};
