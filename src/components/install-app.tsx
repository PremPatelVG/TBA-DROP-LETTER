"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { TBA_LOGO_SRC } from "@/components/brand-logo";

/**
 * "Install the app" prompt. The app is the website (no Play Store, App Store or APK), added to the phone's home
 * screen as an app that opens full screen with the TBA icon (public/manifest.webmanifest):
 * - Android / Chrome (and desktop Chrome or Edge): Chrome fires `beforeinstallprompt` when the site can be
 *   installed; we keep that event and show our own "Install app" button, which opens Chrome's install dialog.
 * - iPhone / iPad: Safari has no install prompt, so we show a short guide: tap Share, then Add to Home Screen.
 * Nothing shows when the app already runs from the home screen, or for a while after the person taps "Not now".
 */

type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Listen as soon as this module loads (it is part of the first screens), so the event is not missed.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // Chrome's own mini bar: we show our button instead
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};
const useInstallPrompt = () => useSyncExternalStore(subscribe, () => deferred, () => null);

/** True when the app is open from the home screen (no browser bar). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches
    || window.matchMedia?.("(display-mode: fullscreen)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone, iPod or iPad (iPadOS reports itself as a Mac with a touch screen). */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

const DISMISS_KEY = "tba.install.dismissed";
const DISMISS_DAYS = 14;
function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return !!at && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}
function rememberDismiss() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode: shows again next visit */ }
}

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="mx-0.5 inline h-4 w-4 align-[-3px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-label="Share">
    <path d="M12 3v12M8 7l4-4 4 4M5 11v8a2 2 0 002 2h10a2 2 0 002-2v-8" />
  </svg>
);

/** The install card: an "Install app" button on Android/Chrome, the Share guide on iPhone, otherwise nothing. */
export function InstallAppBanner({ className = "" }: { className?: string }) {
  const prompt = useInstallPrompt();
  const [state, setState] = useState<{ ready: boolean; ios: boolean; hidden: boolean }>({ ready: false, ios: false, hidden: true });
  useEffect(() => {
    setState({ ready: true, ios: isIos(), hidden: isStandalone() || dismissedRecently() });
  }, []);
  if (!state.ready || state.hidden) return null;
  if (!prompt && !state.ios) return null;

  const close = () => { rememberDismiss(); setState((s) => ({ ...s, hidden: true })); };
  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    deferred = null; // a prompt can be used once
    emit();
    if (outcome === "accepted") setState((s) => ({ ...s, hidden: true }));
  }

  return (
    <div role="region" aria-label="Install the app" className={`flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900 ${className}`}>
      {/* Looks like the home-screen icon: the white TBA logo on brand green. */}
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-700 p-1" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny bundled logo, same as BrandLogo */}
        {TBA_LOGO_SRC ? <img src={TBA_LOGO_SRC} alt="" className="max-h-full max-w-full" /> : <span className="text-xs font-bold text-white">TBA</span>}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Add TBA Drop Letter to your home screen</p>
        {prompt ? (
          <p className="mt-0.5 text-xs text-green-800">Opens full screen like an app, with the TBA icon.</p>
        ) : (
          <p className="mt-0.5 text-xs text-green-800">
            In Safari, tap Share<ShareIcon />then <span className="font-semibold">Add to Home Screen</span>. It then opens full screen like an app.
          </p>
        )}
        <div className="mt-2 flex gap-2">
          {prompt && (
            <button type="button" onClick={install} className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800">Install app</button>
          )}
          <button type="button" onClick={close} className="rounded-md px-2 py-1.5 text-xs text-green-800 hover:bg-green-100">{prompt ? "Not now" : "Got it"}</button>
        </div>
      </div>
    </div>
  );
}
