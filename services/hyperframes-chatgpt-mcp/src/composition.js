const RATIOS = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 }
};

const STYLES = {
  cinematic: { background: '#080B14', foreground: '#F7F8FC', muted: '#A7B0C4' },
  minimal: { background: '#F6F7FB', foreground: '#111827', muted: '#5B6474' },
  bold: { background: '#09090B', foreground: '#FFFFFF', muted: '#D4D4D8' }
};

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'hyperframes-video';
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getDimensions(aspectRatio) {
  return RATIOS[aspectRatio] || RATIOS['16:9'];
}

export function buildComposition({ title, scenes, durationSeconds, aspectRatio, visualStyle, accentColor }) {
  const dimensions = getDimensions(aspectRatio);
  const theme = STYLES[visualStyle] || STYLES.cinematic;
  const segment = durationSeconds / scenes.length;
  const width = dimensions.width;
  const height = dimensions.height;
  const vertical = height > width;

  const sceneMarkup = scenes.map((scene, index) => {
    const heading = escapeHtml(scene.heading);
    const body = escapeHtml(scene.body || '');
    const number = String(index + 1).padStart(2, '0');
    return [
      '<section class="scene" id="scene-' + index + '">',
      '  <div class="scene-content">',
      '    <div class="eyebrow"><span class="dot"></span>' + escapeHtml(title) + '</div>',
      '    <div class="scene-number">' + number + ' / ' + String(scenes.length).padStart(2, '0') + '</div>',
      '    <h1>' + heading + '</h1>',
      body ? '    <p>' + body + '</p>' : '',
      '  </div>',
      '  <div class="corner-mark">H</div>',
      '</section>'
    ].join('\n');
  }).join('\n');

  const animationSteps = scenes.map((scene, index) => {
    const start = Number((index * segment).toFixed(3));
    const end = Number(((index + 1) * segment).toFixed(3));
    const enter = Math.min(0.62, segment * 0.22);
    const exit = Math.min(0.28, segment * 0.14);
    const leaveAt = Math.max(start + enter + 0.05, end - exit);
    return [
      "  tl.fromTo('#scene-" + index + "', { autoAlpha: 0, y: 34, scale: 0.985 }, { autoAlpha: 1, y: 0, scale: 1, duration: " + enter.toFixed(3) + ", ease: 'power3.out' }, " + start + ');',
      "  tl.to('#scene-" + index + "', { autoAlpha: 0, y: -12, duration: " + exit.toFixed(3) + ", ease: 'power2.in' }, " + leaveAt + ');'
    ].join('\n');
  }).join('\n');

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <title>' + escapeHtml(title) + '</title>',
    '  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>',
    '  <style>',
    '    * { box-sizing: border-box; }',
    '    html, body { margin: 0; padding: 0; width: ' + width + 'px; height: ' + height + 'px; overflow: hidden; background: ' + theme.background + '; }',
    '    body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: ' + theme.foreground + '; }',
    '    #root { position: relative; width: ' + width + 'px; height: ' + height + 'px; overflow: hidden; background: ' + theme.background + '; }',
    '    #root:before { content: ""; position: absolute; inset: -18%; background: radial-gradient(ellipse at 78% 24%, ' + accentColor + '26 0%, transparent 42%), radial-gradient(ellipse at 18% 88%, ' + accentColor + '17 0%, transparent 40%); pointer-events: none; }',
    '    .scene { position: absolute; inset: 0; display: grid; align-items: center; padding: ' + (vertical ? '120px 78px' : '110px 150px') + '; opacity: 0; visibility: hidden; }',
    '    .scene-content { position: relative; z-index: 2; max-width: ' + (vertical ? '900px' : '1520px') + '; }',
    '    .eyebrow { display: inline-flex; align-items: center; gap: 16px; color: ' + theme.muted + '; text-transform: uppercase; letter-spacing: .18em; font-size: ' + (vertical ? '22px' : '20px') + '; font-weight: 700; margin-bottom: ' + (vertical ? '54px' : '48px') + '; }',
    '    .dot { display: inline-block; width: 13px; height: 13px; border-radius: 50%; background: ' + accentColor + '; box-shadow: 0 0 26px ' + accentColor + '88; }',
    '    .scene-number { position: absolute; top: 8px; right: 0; color: ' + theme.muted + '; opacity: .62; font-size: 18px; letter-spacing: .2em; }',
    '    h1 { margin: 0; max-width: ' + (vertical ? '850px' : '1450px') + '; font-size: clamp(76px, ' + (vertical ? '9vw' : '6.3vw') + ', ' + (vertical ? '118px' : '136px') + '); line-height: .98; letter-spacing: -.065em; font-weight: 780; text-wrap: balance; }',
    '    p { margin: ' + (vertical ? '44px' : '36px') + ' 0 0; max-width: ' + (vertical ? '760px' : '1180px') + '; color: ' + theme.muted + '; font-size: ' + (vertical ? '34px' : '32px') + '; line-height: 1.45; font-weight: 430; }',
    '    .corner-mark { position: absolute; bottom: ' + (vertical ? '76px' : '70px') + '; right: ' + (vertical ? '76px' : '110px') + '; z-index: 3; width: 54px; height: 54px; display: grid; place-items: center; border-radius: 16px; border: 1px solid ' + accentColor + '70; color: ' + accentColor + '; font-size: 24px; font-weight: 800; }',
    '    #progress { position: absolute; z-index: 8; left: 0; bottom: 0; width: 100%; height: 7px; background: ' + theme.foreground + '14; }',
    '    #progress span { display: block; height: 100%; width: 100%; background: ' + accentColor + '; transform: scaleX(0); transform-origin: left center; }',
    '  </style>',
    '</head>',
    '<body>',
    '  <div id="root" data-composition-id="main" data-start="0" data-width="' + width + '" data-height="' + height + '" data-duration="' + durationSeconds + '">',
    sceneMarkup,
    '    <div id="progress"><span></span></div>',
    '  </div>',
    '  <script>',
    '    window.__timelines = window.__timelines || {};',
    '    const tl = gsap.timeline({ paused: true });',
    "    tl.set('.scene', { autoAlpha: 0 });",
    animationSteps,
    "    tl.fromTo('#progress span', { scaleX: 0 }, { scaleX: 1, duration: " + durationSeconds + ", ease: 'none' }, 0);",
    "    window.__timelines['main'] = tl;",
    '  </script>',
    '</body>',
    '</html>'
  ].join('\n');
}

export function validateCustomComposition(html, durationSeconds, aspectRatio) {
  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) {
    throw new Error('composition_html must be a complete HTML document with html and body elements.');
  }
  if (!/data-composition-id\s*=\s*["'][^"']+["']/i.test(html)) {
    throw new Error('composition_html needs a root element with data-composition-id.');
  }
  if (!/data-width\s*=\s*["']\d+["']/i.test(html) || !/data-height\s*=\s*["']\d+["']/i.test(html)) {
    throw new Error('composition_html needs data-width and data-height on its composition root.');
  }
  if (!/data-duration\s*=\s*["']\d+(?:\.\d+)?["']/i.test(html)) {
    throw new Error('composition_html needs a fixed data-duration on its composition root.');
  }
  const dimensions = getDimensions(aspectRatio);
  if (!html.includes('data-width="' + dimensions.width + '"') || !html.includes('data-height="' + dimensions.height + '"')) {
    throw new Error('composition_html dimensions do not match aspect_ratio ' + aspectRatio + '.');
  }
  if (durationSeconds < 1 || durationSeconds > 60) {
    throw new Error('duration_seconds must be between 1 and 60.');
  }
}
