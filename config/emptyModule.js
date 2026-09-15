/**
 * Stand-in for jsPDF's `html()` optional dependencies (html2canvas, canvg, dompurify).
 * Nothing in the repo calls `jsPDF.prototype.html()` — rasterisation goes through
 * html-to-image in `src/common/export/exportCapture.js` — so `vite.config.js` aliases the
 * three dynamic imports here and no chunk is emitted for them.
 */
export default {};
