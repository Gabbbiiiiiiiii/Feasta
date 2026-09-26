// Component tests must never depend on local or production Firebase
// credentials. firebase/client.ts validates configuration at import time,
// so provide isolated test-only values before application modules load.
process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??= "test-api-key";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??= "test.firebaseapp.com";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= "feasta-test";
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??= "feasta-test.appspot.com";
process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??= "123456789";
process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??= "1:123456789:web:test";

import "@testing-library/jest-dom/vitest";

import {cleanup} from "@testing-library/react";
import {afterEach, vi} from "vitest";

// `server-only` is a Next.js build-time boundary marker. Component tests
// intentionally import server-backed module graphs in Vitest, so replace
// only the marker itself while leaving production server boundaries intact.
vi.mock("server-only", () => ({}));

// Layout component tests exercise navigation and responsive UI rather than
// provider messaging persistence. Mock the indicator at its component
// boundary so importing the shell does not initialize Firebase Admin.
vi.mock("@/components/layout/provider-message-indicator", () => ({
  ProviderMessageIndicator: () => null,
}));

afterEach(() => cleanup());

if (!globalThis.PointerEvent) {
  globalThis.PointerEvent = MouseEvent as typeof PointerEvent;
}

Object.defineProperty(Element.prototype, "hasPointerCapture", {
  configurable: true,
  value: () => false,
});
Object.defineProperty(Element.prototype, "setPointerCapture", {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(Element.prototype, "releasePointerCapture", {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: () => undefined,
});
