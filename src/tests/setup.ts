import '@testing-library/jest-dom/vitest';

// Browser-only setup; server tests run in a plain Node environment.
if (typeof window !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  const { MotionGlobalConfig } = await import('framer-motion');

  // Animations are visual only; skip them so tests run instantly.
  MotionGlobalConfig.skipAnimations = true;

  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  afterEach(() => cleanup());
}
