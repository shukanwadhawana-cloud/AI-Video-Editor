import test from 'node:test';
import assert from 'node:assert/strict';
import { buildComposition, escapeHtml, getDimensions, slugify, validateCustomComposition } from '../src/composition.js';

test('slugifies titles for safe project paths', () => {
  assert.equal(slugify('MedLum: Clinical Intelligence!'), 'medlum-clinical-intelligence');
});

test('escapes user text before inserting it into HTML', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
});

test('builds a timed HyperFrames composition for vertical video', () => {
  const html = buildComposition({
    title: 'Demo',
    scenes: [{ heading: 'Hello', body: 'World' }, { heading: 'Goodbye', body: '' }],
    durationSeconds: 12,
    aspectRatio: '9:16',
    visualStyle: 'cinematic',
    accentColor: '#23D5AB'
  });
  assert.match(html, /data-composition-id="main"/);
  assert.match(html, /data-width="1080"/);
  assert.match(html, /data-height="1920"/);
  assert.match(html, /data-duration="12"/);
  assert.match(html, /window\.__timelines\['main'\] = tl/);
  assert.match(html, /Hello/);
  assert.match(html, /Goodbye/);
});

test('rejects custom composition HTML without timeline dimensions', () => {
  assert.throws(
    () => validateCustomComposition('<html><body><div data-composition-id="x"></div></body></html>', 10, '16:9'),
    /data-width and data-height/
  );
});

test('maps supported aspect ratios to render dimensions', () => {
  assert.deepEqual(getDimensions('1:1'), { width: 1080, height: 1080 });
});
