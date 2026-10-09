// Animated versions of the page icons (transparent VP9 WebMs in
// /public/page-icons). Each plays once when its page opens and stops on its
// last frame, which lands exactly where the static PNG would sit.
//
// The videos are cropped to everything the animation ever draws, so parts of
// it can move outside the icon box. `end` is where the drawing sits in the
// last frame, as fractions of the video: PageHero fits that rectangle into
// the icon box the way the PNG is fitted, and lets the rest overflow.
// `w`/`h` are the video's pixel size (only the aspect ratio matters).
// Re-measure these if an animation is re-exported.
export const PAGE_ICON_ANIMATIONS = {
  '/page-icons/journal.png':       { src: '/page-icons/journal.webm',       w: 234, h: 216, end: { x: 0.0113, y: 0.2649, w: 0.9811, h: 0.7269 } },
  '/page-icons/notes.png':         { src: '/page-icons/notes.webm',         w: 176, h: 162, end: { x: 0.0109, y: 0.0095, w: 0.9803, h: 0.981 } },
  '/page-icons/conversations.png': { src: '/page-icons/conversations.webm', w: 156, h: 162, end: { x: 0.0094, y: 0.0114, w: 0.9811, h: 0.9795 } },
  '/page-icons/threads.png':       { src: '/page-icons/threads.webm',       w: 208, h: 162, end: { x: 0.0092, y: 0.0094, w: 0.7051, h: 0.9765 } },
  '/page-icons/context.png':       { src: '/page-icons/context.webm',       w: 194, h: 160, end: { x: 0.0064, y: 0.0077, w: 0.9871, h: 0.9845 } },
};

// Transparent WebM only plays in Chromium/Firefox. Safari, and every iOS
// browser (all WebKit underneath), would show a black box — those get the
// static PNG. So does anyone who has asked for reduced motion.
export function canPlayIconAnimations() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const webkitOnly = /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (webkitOnly || iOS) return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
