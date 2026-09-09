import test from 'node:test';
import assert from 'node:assert/strict';
import { renderStaticPage } from './static-pages.mjs';

const chrome = { header: '<header class="sakutio-chrome">Header</header>', footer: '<footer class="sakutio-chrome">Footer</footer>' };
const article = '<main><article><h1>日本語 &amp; guide</h1><!-- keep --><p>本文</p></article></main>';
const page = '<!doctype html><html><head><title>Keep</title><script type="application/ld+json">{"name":"keep"}</script><script defer src="https://sakutio.com/shared/sakutio-global-header.js"></script><script src="/shared/sakutio-global-footer.js"></script><script src="https://sakutio.com/shared/sakutio-guide-v1.js"></script></head><body><sakutio-global-header><a>fallback</a></sakutio-global-header>' + article + '<sakutio-global-footer></sakutio-global-footer></body></html>';

test('renders canonical Chrome and preserves article and unrelated metadata/scripts byte-for-byte', () => {
  const result = renderStaticPage(page, chrome, true);
  assert.ok(result.includes(article));
  assert.ok(result.includes('<script type="application/ld+json">{"name":"keep"}</script>'));
  assert.ok(result.includes('sakutio-guide-v1.js'));
  assert.ok(result.includes(chrome.header) && result.includes(chrome.footer));
  assert.ok(result.includes('href="/shared-chrome/static-chrome.css"'));
  assert.ok(!result.includes('sakutio-global-'));
});
test('new canonical bytes are used on the next local build', () => {
  assert.ok(renderStaticPage(page, { ...chrome, header: '<header>new</header>' }, true).includes('<header>new</header>'));
});
test('ordinary SPA entry is left untouched', () => {
  assert.equal(renderStaticPage('<html><head></head><body><div id="root"></div></body></html>', chrome), null);
});
test('guide without slots fails instead of silently missing future sync', () => {
  assert.throws(() => renderStaticPage('<html><head></head><body>guide</body></html>', chrome, true));
});
test('duplicate, missing, unclosed and nested slots fail', () => {
  for (const html of [
    page.replace(article, article + '<sakutio-global-header></sakutio-global-header>'),
    page.replace('<sakutio-global-footer></sakutio-global-footer>', ''),
    page.replace('</sakutio-global-footer>', ''),
    page.replace('<sakutio-global-header>', '<sakutio-global-header><sakutio-global-footer></sakutio-global-footer>'),
    page.replace('<sakutio-global-header>', '<template><sakutio-global-header>').replace('</sakutio-global-header>', '</sakutio-global-header></template>'),
  ]) assert.throws(() => renderStaticPage(html, chrome, true));
});
test('HTML-escaped, query and pinned legacy script URLs are removed', () => {
  const changed = page.replace('https://sakutio.com/shared/sakutio-global-header.js', '/shared-pinned/sakutio-global-header-abcd.js?v=1&amp;x=2');
  assert.ok(!renderStaticPage(changed, chrome, true).includes('sakutio-global-header'));
});
