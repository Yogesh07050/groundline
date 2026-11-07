// Loads the real embeddable widget into a page, exactly as a customer site would.
import { type RefObject, useEffect } from 'react';

interface WidgetApi {
  floating(): void;
  mount(element: HTMLElement): void;
  open(): void;
  destroy(): void;
}

declare global {
  interface Window {
    GroundlineWidget?: WidgetApi;
  }
}

let loading: Promise<WidgetApi> | null = null;

function loadWidget(): Promise<WidgetApi> {
  loading ??= new Promise((resolve, reject) => {
    if (window.GroundlineWidget) {
      resolve(window.GroundlineWidget);
      return;
    }
    const script = document.createElement('script');
    script.src = '/widget.js';
    script.dataset.auto = 'false';
    script.onload = () => resolve(window.GroundlineWidget!);
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not load the widget.'));
    };
    document.body.appendChild(script);
  });
  return loading;
}

/** Pass a ref to render inline; omit it for the floating launcher. */
export function useWidget(target?: RefObject<HTMLElement | null>, onError?: () => void) {
  useEffect(() => {
    let cancelled = false;
    loadWidget()
      .then((widget) => {
        if (cancelled) return;
        if (target) {
          if (target.current) widget.mount(target.current);
        } else {
          widget.floating();
        }
      })
      .catch(() => {
        if (!cancelled) onError?.();
      });
    return () => {
      cancelled = true;
      window.GroundlineWidget?.destroy();
    };
    // Mounts once for the lifetime of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export const openWidget = () => window.GroundlineWidget?.open();
