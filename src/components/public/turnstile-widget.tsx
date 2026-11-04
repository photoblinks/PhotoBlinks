"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: { sitekey: string }) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Turnstile failed to load"));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

/** Cloudflare Turnstile challenge. Renders a `cf-turnstile-response` hidden
 * input inside the enclosing <form>; the server verifies it (see
 * src/lib/turnstile.ts). Tokens are single-use, so the widget resets itself
 * right after the form submits. Renders nothing when no site key is set. */
export function TurnstileWidget() {
  const containerRef = useRef<HTMLDivElement>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    const container = containerRef.current;
    if (!siteKey || !container) return;

    let widgetId: string | undefined;
    let cancelled = false;
    const form = container.closest("form");
    // Runs after the submit event finishes, i.e. after the form data (and the
    // token in it) has already been read.
    const resetAfterSubmit = () =>
      setTimeout(() => {
        if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
      }, 0);

    loadScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widgetId = window.turnstile.render(container, { sitekey: siteKey });
        form?.addEventListener("submit", resetAfterSubmit);
      })
      .catch(() => {
        // Blocked script: the server rejects the missing token with a clear message.
      });

    return () => {
      cancelled = true;
      form?.removeEventListener("submit", resetAfterSubmit);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={containerRef} className="min-h-[65px]" />;
}
