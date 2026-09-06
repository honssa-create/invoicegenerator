/** Places "Page X of Y" at the bottom of each A4 slice in standalone HTML templates. */
(function () {
  var PAGE_MM = 297;

  function formatLabel(page, total) {
    return 'Page ' + page + ' of ' + total;
  }

  function pageHeightPx(root) {
    var probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      'position:absolute;left:0;top:0;visibility:hidden;height:' + PAGE_MM + 'mm;width:0;pointer-events:none';
    root.appendChild(probe);
    var h = probe.offsetHeight;
    root.removeChild(probe);
    return h > 0 ? h : 1;
  }

  function countPages(heightPx, pagePx) {
    if (!(pagePx > 0) || !(heightPx > 0)) return 1;
    return Math.max(1, Math.ceil(heightPx / pagePx - 1e-9));
  }

  function render(page) {
    page.querySelectorAll('[data-print-page-marker]').forEach(function (node) {
      node.remove();
    });
    var leftover = page.querySelector('.quo-page-number:not([data-print-page-marker])');
    if (leftover) leftover.remove();

    page.style.minHeight = PAGE_MM + 'mm';
    var total = countPages(page.offsetHeight, pageHeightPx(page));
    page.style.minHeight = total * PAGE_MM + 'mm';

    for (var i = 1; i <= total; i++) {
      var el = document.createElement('div');
      el.className = 'quo-page-number';
      el.setAttribute('data-print-page-marker', '');
      el.setAttribute('aria-label', formatLabel(i, total));
      el.style.top = 'calc(' + (i - 1) + ' * ' + PAGE_MM + 'mm)';
      el.textContent = formatLabel(i, total);
      page.appendChild(el);
    }
  }

  function init() {
    document.querySelectorAll('.preview-page').forEach(render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.addEventListener('beforeprint', init);
})();
