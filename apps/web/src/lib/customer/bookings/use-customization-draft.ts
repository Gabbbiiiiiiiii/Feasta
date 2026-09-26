"use client";

import {useEffect, useRef, useState} from "react";

import {
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
}: {
  owner: string;
  providerId: string;
  packageId: string;
  context: string;
  value: CustomizationDraft;
  restore: (value: CustomizationDraft) => void;
}) {
  const key = customizationDraftKey(
    owner,
    providerId,
    packageId,
    context,
  );

  const guestKey = customizationDraftKey(
    "guest",
    providerId,
    packageId,
    context,
  );

  const [status, setStatus] =
    useState("Preparing draft...");

  const [choices, setChoices] =
    useState<ReturnType<typeof listCustomizationDrafts>>(
      [],
    );

  const [isReady, setIsReady] =
    useState(false);

  const [savedSignature, setSavedSignature] =
    useState("");

  const activeKey = useRef(key);
  const ready = useRef(false);
  const completed = useRef(false);
  const latest = useRef(value);
  const restoreRef = useRef(restore);
  const lastSaved = useRef("");

  const submission =
    useRef<CustomizationDraft["submission"]>(
      undefined,
    );

  const currentSignature =
    JSON.stringify(value);

  useEffect(() => {
    latest.current = value;
    restoreRef.current = restore;
  });

  useEffect(() => {
    ready.current = false;
    completed.current = false;

    submission.current = undefined;
    lastSaved.current = "";

    activeKey.current = key;

    const timer = window.setTimeout(() => {
      try {
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

        const own =
          readCustomizationDraft(
            localStorage,
            key,
          );

        const guest =
          owner !== "guest"
            ? readCustomizationDraft(
                localStorage,
                guestKey,
              )
            : null;

        const saved = own ?? guest;

        if (saved) {
          submission.current =
            saved.submission;

          restoreRef.current(saved);
          latest.current = saved;

          const restoredSignature =
            JSON.stringify({
              event: saved.event,
              customization:
                saved.customization,
              addonIds: saved.addonIds,
              ownAddons:
                saved.ownAddons ?? false,
              ownAddonsNote:
                saved.ownAddonsNote ?? "",
            });

          lastSaved.current =
            restoredSignature;

          setSavedSignature(
            restoredSignature,
          );

          if (!own && guest) {
            saveCustomizationDraft(
              localStorage,
              key,
              guest,
            );

            localStorage.removeItem(
              guestKey,
            );
          }

          setStatus(
            "Draft restored. Review your selections and current availability.",
          );
        } else {
          const initialSignature =
            JSON.stringify(latest.current);

          lastSaved.current =
            initialSignature;

          setSavedSignature(
            initialSignature,
          );

          const alternatives =
            listCustomizationDrafts(
              localStorage,
              owner,
              providerId,
              packageId,
            );

          const guestAlternatives =
            owner !== "guest"
              ? listCustomizationDrafts(
                  localStorage,
                  "guest",
                  providerId,
                  packageId,
                )
              : [];

          const ownPrefix =
            customizationDraftKey(
              owner,
              providerId,
              packageId,
            );

          const guestPrefix =
            customizationDraftKey(
              "guest",
              providerId,
              packageId,
            );

          const unclaimed =
            guestAlternatives.filter(
              (item) =>
                !alternatives.some(
                  (ownDraft) =>
                    ownDraft.key ===
                    ownPrefix +
                      item.key.slice(
                        guestPrefix.length,
                      ),
                ),
            );

          setChoices(
            [
              ...alternatives,
              ...unclaimed,
            ].filter(
              (item) =>
                item.key !== key,
            ),
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

    if (
      submission.current?.fingerprint !==
      fingerprint
    ) {
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

  function resume(
    choice: (typeof choices)[number],
  ) {
    const guestPrefix =
      customizationDraftKey(
        "guest",
        providerId,
        packageId,
      );

    activeKey.current =
      owner !== "guest" &&
      choice.key.startsWith(
        guestPrefix,
      )
        ? customizationDraftKey(
            owner,
            providerId,
            packageId,
          ) +
          choice.key.slice(
            guestPrefix.length,
          )
        : choice.key;

    let current = choice.value;

    try {
      /*
       * Re-read at activation. Another tab may
       * have saved a newer owned draft.
       */
      current =
        readCustomizationDraft(
          localStorage,
          activeKey.current,
        ) ??
        readCustomizationDraft(
          localStorage,
          choice.key,
        ) ??
        choice.value;

      saveCustomizationDraft(
        localStorage,
        activeKey.current,
        current,
      );

      if (
        activeKey.current !==
        choice.key
      ) {
        localStorage.removeItem(
          choice.key,
        );
      }

      const signature =
        JSON.stringify({
          event: current.event,
          customization:
            current.customization,
          addonIds:
            current.addonIds,
          ownAddons:
            current.ownAddons ??
            false,
          ownAddonsNote:
            current.ownAddonsNote ??
            "",
        });

      lastSaved.current =
        signature;

      setSavedSignature(signature);

      setStatus(
        "Draft restored. Review your selections and current availability.",
      );
    } catch {
      setStatus(
        "Draft restored, but this device could not save it.",
      );
    }

    restoreRef.current(current);
    latest.current = current;

    submission.current =
      current.submission;

    setChoices([]);
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
    isReady,
    isDirty,
    isSaved,
    saveNow,
    discard,
    clear,
    submissionId,
    choices,
    resume,
  };
}