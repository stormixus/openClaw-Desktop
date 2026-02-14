import * as THREE from 'three';

/**
 * Theme-aware Three.js scene background.
 * Reads the current theme from `document.documentElement.dataset.theme`
 * and returns appropriate scene background colors.
 */

const DARK_BG = 0x0a0a0f;
const LIGHT_BG = 0xe5e7eb;

function isDark(): boolean {
  if (typeof document === 'undefined') return true;
  return document.documentElement.dataset.theme !== 'light';
}

/** Get the current scene background color based on the active theme. */
export function getSceneBg(): THREE.Color {
  return new THREE.Color(isDark() ? DARK_BG : LIGHT_BG);
}

/**
 * Watch for theme changes and auto-update scene.background.
 * Returns a cleanup function to call in onDestroy.
 */
export function watchSceneTheme(scene: THREE.Scene): () => void {
  scene.background = getSceneBg();

  const observer = new MutationObserver(() => {
    scene.background = getSceneBg();
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  return () => observer.disconnect();
}
