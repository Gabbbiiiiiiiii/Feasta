"use client";

import {useEffect, useRef, useState} from "react";

import {
  customizationDraftEditSignature,
  customizationDraftKey,
  listCustomizationDrafts,
  readCustomizationDraft,
  saveCustomizationDraft,
  type CustomizationDraft,
} from "./customization-draft";

export function useCustomizationDraft({
  owner,
  providerId,
  packageId,
  context,
  value,
  restore,
  explicitSource,
}: {
  owner: string;
  providerId: string;
  packageId: string;
  context: string;
  value: CustomizationDraft;
  restore: (value: CustomizationDraft) => void;
  explicitSource?: () => Promise<CustomizationDraft>;
}) {
  // Event List edits retain their separate source and storage scope.
  const key = customizationDraftKey(owner, providerId, packageId, explicitSource ? context : "");
  const guestKey = customizationDraftKey("guest", providerId, packageId);

  const [freshKey, setFreshKey] = useState<string | null>(null);

  const [status, setStatus] =
    useState("Preparing draft...");

  const [isReady, setIsReady] =
    useState(false);

  const [savedSignature, setSavedSignature] =
    useState("");

  const activeKey = useRef(key);
  const ready = useRef(false);
  const completed = useRef(false);
  const latest = useRef(value);
  const restoreRef = useRef(restore);
  const explicitSourceRef = useRef(explicitSource);
  const lastSaved = useRef("");

  const submission =
    useRef<CustomizationDraft["submission"]>(
      undefined,
    );
  const restoredSubmissionId = useRef<string | undefined>(undefined);

  const currentSignature =
    JSON.stringify(value);

  useEffect(() => {
    latest.current = value;
    restoreRef.current = restore;
    explicitSourceRef.current = explicitSource;
  });

  useEffect(() => {
    ready.current = false;
    completed.current = false;

    submission.current = undefined;
    restoredSubmissionId.current = undefined;
    lastSaved.current = "";

    activeKey.current = key;

    const timer = window.setTimeout(async () => {
      try {
        if (explicitSourceRef.current) {
          const selected = await explicitSourceRef.current();
          if (activeKey.current !== key || completed.current) return;
          restoreRef.current(selected);
          latest.current = selected;
          const signature = JSON.stringify(customizationDraftEditSignature(selected));
          lastSaved.current = signature;
          setSavedSignature(signature);
          setStatus("Event List configuration restored. Review current options and prices.");
          ready.current = true;
          setIsReady(true);
          return;
        }
        /*
         * Preserve this customer's older local drafts
         * when using the explicit customer namespace.
         */
        const legacyOwner =
          owner.startsWith("customer:")
            ? owner.slice("customer:".length)
            : null;

        if (
          legacyOwner &&
          legacyOwner !== "guest" &&
          !legacyOwner.startsWith("customer:")
        ) {
          const legacyPrefix =
            customizationDraftKey(
              legacyOwner,
              providerId,
              packageId,
            );

          const ownPrefix =
            customizationDraftKey(
              owner,
              providerId,
              packageId,
            );

          for (
            const legacy of listCustomizationDrafts(
              localStorage,
              legacyOwner,
              providerId,
              packageId,
            )
          ) {
            const destination =
              ownPrefix +
              legacy.key.slice(
                legacyPrefix.length,
              );

            if (
              !readCustomizationDraft(
                localStorage,
                destination,
              )
            ) {
              saveCustomizationDraft(
                localStorage,
                destination,
                legacy.value,
              );
            }

            localStorage.removeItem(
              legacy.key,
            );
          }
        }

        const packageDrafts = (draftOwner: string) =>
          listCustomizationDrafts(localStorage, draftOwner, providerId, packageId)
            .filter(({key: candidate}) => !decodeURIComponent(candidate.split(":").at(-1) ?? "").startsWith("event-list:"));
        const owned = packageDrafts(owner);
        const guestDrafts = owner === "guest" ? [] : packageDrafts("guest");
        const select = (drafts: typeof owned, canonical: string, draftOwner: string) =>
          drafts.find((draft) => draft.key === canonical) ??
          drafts.find((draft) => draft.value.submission) ??
          drafts.find((draft) => draft.key === customizationDraftKey(draftOwner, providerId, packageId, context)) ??
          drafts[0];
        const selected = select(owned, key, owner) ?? select(guestDrafts, guestKey, "guest");
        const saved = selected?.value;

        if (selected && saved) {
          submission.current =
            saved.submission;
          restoredSubmissionId.current = saved.submission?.clientRequestId;

          restoreRef.current(saved);
          latest.current = saved;

          const restoredSignature =
            JSON.stringify(
              customizationDraftEditSignature(
                saved,
              ),
            );

          lastSaved.current =
            restoredSignature;

          setSavedSignature(
            restoredSignature,
          );

          if (selected.key !== key) {
            saveCustomizationDraft(localStorage, key, saved);
          }
          for (const draft of owned) {
            if (draft.key !== key) localStorage.removeItem(draft.key);
          }
          if (selected.key.startsWith(guestKey) && selected.key !== key) {
            for (const draft of guestDrafts) localStorage.removeItem(draft.key);
          }

          setStatus(
            "Draft restored. Review your selections and current availability.",
          );
        } else {
          setFreshKey(key);
          const initialSignature =
            JSON.stringify(latest.current);

          lastSaved.current =
            initialSignature;

          setSavedSignature(
            initialSignature,
          );

          setStatus(
            "Changes save automatically",
          );
        }
      } catch {
        setStatus(
          "Unable to save a draft on this device. Keep this page open to preserve your changes.",
        );
      }

      ready.current = true;
      setIsReady(true);
    }, 0);

    const flush = () => {
      if (
        !ready.current ||
        completed.current
      ) {
        return;
      }

      const signature =
        JSON.stringify(latest.current);

      if (
        signature ===
          lastSaved.current &&
        !submission.current
      ) {
        return;
      }

      try {
        saveCustomizationDraft(
          localStorage,
          activeKey.current,
          {
            ...latest.current,
            submission:
              submission.current,
          },
        );

        lastSaved.current =
          signature;

        setSavedSignature(
          signature,
        );
      } catch {
        /*
         * The current form remains intact.
         */
      }
    };

    window.addEventListener(
      "pagehide",
      flush,
    );

    const hidden = () => {
      if (
        document.visibilityState ===
        "hidden"
      ) {
        flush();
      }
    };

    document.addEventListener(
      "visibilitychange",
      hidden,
    );

    return () => {
      window.clearTimeout(timer);

      flush();

      window.removeEventListener(
        "pagehide",
        flush,
      );

      document.removeEventListener(
        "visibilitychange",
        hidden,
      );
    };
  }, [
    key,
    guestKey,
    context,
    owner,
    providerId,
    packageId,
  ]);

  useEffect(() => {
    if (
      !ready.current ||
      completed.current
    ) {
      return;
    }

    const serialized =
      JSON.stringify(value);

    if (
      serialized ===
      lastSaved.current
    ) {
      return;
    }

    const timer = window.setTimeout(
      () => {
        if (completed.current) {
          return;
        }

        try {
          saveCustomizationDraft(
            localStorage,
            activeKey.current,
            {
              ...latest.current,
              submission:
                submission.current,
            },
          );

          lastSaved.current =
            serialized;

          setSavedSignature(
            serialized,
          );

          setStatus("Draft saved");
        } catch {
          setStatus(
            "Unable to save a draft on this device. Your changes are still on this page.",
          );
        }
      },
      400,
    );

    return () =>
      window.clearTimeout(timer);
  }, [key, value]);

  function saveNow(): boolean {
    if (
      !ready.current ||
      completed.current
    ) {
      return false;
    }

    try {
      const signature =
        JSON.stringify(
          latest.current,
        );

      saveCustomizationDraft(
        localStorage,
        activeKey.current,
        {
          ...latest.current,
          submission:
            submission.current,
        },
      );

      lastSaved.current =
        signature;

      setSavedSignature(signature);

      setStatus("Draft saved");

      return true;
    } catch {
      setStatus(
        "Unable to save a draft on this device. Your changes are still on this page.",
      );

      return false;
    }
  }

  function discard(): boolean {
    try {
      /*
       * Prevent the cleanup/pagehide flush from
       * recreating the draft after it is discarded.
       */
      completed.current = true;

      localStorage.removeItem(
        activeKey.current,
      );

      setSavedSignature("");
      setStatus(
        "Draft discarded.",
      );

      return true;
    } catch {
      /*
       * Allow normal persistence again if the
       * browser could not remove the draft.
       */
      completed.current = false;

      setStatus(
        "Unable to discard this draft on this device.",
      );

      return false;
    }
  }

  function clear() {
    completed.current = true;

    try {
      localStorage.removeItem(
        activeKey.current,
      );
    } catch {
      setStatus(
        "Booking submitted. This device could not clear its saved draft.",
      );
    }
  }

  async function submissionId(
    draftIdentity: string,
    create: () => string,
  ) {
    const digest =
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          draftIdentity,
        ),
      );

    const fingerprint =
      Array.from(
        new Uint8Array(digest),
        (byte) =>
          byte
            .toString(16)
            .padStart(2, "0"),
      ).join("");

    if (!submission.current) {
      submission.current = {
        fingerprint,
        clientRequestId: create(),
      };
    }

    try {
      saveCustomizationDraft(
        localStorage,
        activeKey.current,
        {
          ...latest.current,
          submission:
            submission.current,
        },
      );
    } catch {
      setStatus(
        "Unable to save a draft on this device. Your changes are still on this page.",
      );
    }

    return submission.current
      .clientRequestId;
  }

  const isDirty =
    isReady &&
    currentSignature !==
      savedSignature;

  const isSaved =
    isReady &&
    !isDirty;

  return {
    status,
    isFresh: freshKey === key,
    isReady,
    isDirty,
    isSaved,
    saveNow,
    discard,
    clear,
    submissionId,
    previousSubmissionId: () => restoredSubmissionId.current,
  };
}
