"use client";

import {
  Images,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useState,
} from "react";

import {
  CatalogImageUploader,
  uploadCatalogImages,
} from "@/components/provider/catalog-image-uploader";
import {
  Button,
} from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Input,
} from "@/components/ui/input";
import {
  Textarea,
} from "@/components/ui/textarea";
import type {
  CatalogImageDraft,
} from "@/lib/provider/catalog-media";
import {
  PROVIDER_SETUP_EVENT_TYPES,
  PROVIDER_SETUP_IMAGE_LIMIT,
  PROVIDER_SETUP_THEME_TAG_LIMIT,
  type ProviderSetup,
  type ProviderSetupEventType,
  type ProviderSetupGallery,
} from "@/lib/provider/provider-setup-gallery";

import {
  loadProviderSetupGalleryAction,
  saveProviderSetupGalleryAction,
} from "./setup-gallery-actions";

type SetupDraft = {
  id: string;
  title: string;
  description: string;
  eventType:
    ProviderSetupEventType | "";
  themeTagsText: string;
  images: CatalogImageDraft[];
  isPublished: boolean;
};

export function ProviderSetupGalleryManager() {
  const [
    gallery,
    setGallery,
  ] = useState<ProviderSetupGallery>({
    revision: 0,
    setups: [],
  });

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    busy,
    setBusy,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  );

  const [
    open,
    setOpen,
  ] = useState(false);

  const [
    draft,
    setDraft,
  ] = useState<SetupDraft | null>(
    null,
  );

  useEffect(() => {
    let active = true;

    loadProviderSetupGalleryAction()
      .then((loaded) => {
        if (active) {
          setGallery(loaded);
        }
      })
      .catch(() => {
        if (active) {
          setError(
            "Your previous setups could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  function startAdd() {
    setError(null);

    setDraft({
      id:
        crypto.randomUUID(),
      title: "",
      description: "",
      eventType: "",
      themeTagsText: "",
      images: [],
      isPublished: false,
    });

    setOpen(true);
  }

  function startEdit(
    setup: ProviderSetup,
  ) {
    setError(null);

    setDraft({
      id:
        setup.id,

      title:
        setup.title,

      description:
        setup.description,

      eventType:
        setup.eventType,

      themeTagsText:
        setup.themeTags.join(
          ", ",
        ),

      images:
        setup.imageUrls.map(
          (url, index) => ({
            id:
              `existing-${setup.id}-${index}`,

            title: "",
            url,
          }),
        ),

      isPublished:
        setup.isPublished,
    });

    setOpen(true);
  }

  async function saveDraft() {
    if (
      !draft ||
      busy
    ) {
      return;
    }

    setError(null);

    const title =
      draft.title
        .trim()
        .replace(
          /\s+/gu,
          " ",
        );

    const description =
      draft.description.trim();

    const themeTags =
      normalizeThemeTags(
        draft.themeTagsText,
      );

    if (!title) {
      setError(
        "Enter a setup title.",
      );

      return;
    }

    if (!draft.eventType) {
      setError(
        "Choose the event type for this setup.",
      );

      return;
    }

    if (
      draft.isPublished &&
      draft.images.length === 0
    ) {
      setError(
        "Add at least one photo before publishing this setup.",
      );

      return;
    }

    setBusy(true);

    try {
      const uploaded =
        await uploadCatalogImages(
          draft.images,
          (saved) => {
            setDraft(
              (current) =>
                current
                  ? {
                      ...current,

                      images:
                        current.images.map(
                          (image) =>
                            image.id ===
                            saved.id
                              ? saved
                              : image,
                        ),
                    }
                  : current,
            );
          },
        );

      const setup:
        ProviderSetup = {
        id:
          draft.id,

        title,
        description,

        eventType:
          draft.eventType,

        themeTags,

        imageUrls:
          uploaded.map(
            (image) =>
              image.url,
          ),

        isPublished:
          draft.isPublished,
      };

      const exists =
        gallery.setups.some(
          (item) =>
            item.id ===
            setup.id,
        );

      const nextSetups =
        exists
          ? gallery.setups.map(
              (item) =>
                item.id ===
                setup.id
                  ? setup
                  : item,
            )
          : [
              ...gallery.setups,
              setup,
            ];

      const result =
        await saveProviderSetupGalleryAction(
          {
            revision:
              gallery.revision,

            setups:
              nextSetups,
          },
        );

      if (!result.ok) {
        setError(
          result.error,
        );

        return;
      }

      setGallery(
        result.gallery,
      );

      setOpen(false);
      setDraft(null);
    }
    catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The setup could not be saved.",
      );
    }
    finally {
      setBusy(false);
    }
  }

  async function removeSetup(
    setup: ProviderSetup,
  ) {
    if (
      busy ||
      !window.confirm(
        `Remove "${setup.title}" from your previous setups?`,
      )
    ) {
      return;
    }

    setError(null);
    setBusy(true);

    try {
      const result =
        await saveProviderSetupGalleryAction(
          {
            revision:
              gallery.revision,

            setups:
              gallery.setups.filter(
                (item) =>
                  item.id !==
                  setup.id,
              ),
          },
        );

      if (!result.ok) {
        setError(
          result.error,
        );

        return;
      }

      setGallery(
        result.gallery,
      );
    }
    finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Images
              aria-hidden="true"
              className="size-5 text-primary-strong"
            />

            <h2 className="text-xl font-bold">
              Previous Event Setups
            </h2>
          </div>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Show customers real setups you have completed.
            Add photos, event type, and theme details so customers
            can use your work as inspiration when booking.
          </p>
        </div>

        <Button
          type="button"
          onClick={startAdd}
          disabled={
            loading ||
            busy
          }
        >
          <Plus
            aria-hidden="true"
            className="size-4"
          />

          Add setup
        </Button>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-5 text-sm text-muted-foreground">
          Loading previous setups...
        </p>
      ) : gallery.setups.length > 0 ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {gallery.setups.map(
            (setup) => (
              <article
                key={setup.id}
                className="overflow-hidden rounded-xl border border-border bg-background"
              >
                {setup.imageUrls[0] ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        setup.imageUrls[0]
                      }
                      alt=""
                      className="h-44 w-full bg-muted object-cover"
                    />
                  </>
                ) : (
                  <div className="grid h-44 place-items-center bg-muted">
                    <Images
                      aria-hidden="true"
                      className="size-8 text-muted-foreground"
                    />
                  </div>
                )}

                <div className="grid gap-3 p-4">
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-bold">
                        {setup.title}
                      </h3>

                      <span
                        className={[
                          "rounded-full px-2.5 py-1 text-xs font-bold",
                          setup.isPublished
                            ? "bg-emerald-500/10 text-emerald-700"
                            : "bg-muted text-muted-foreground",
                        ].join(" ")}
                      >
                        {setup.isPublished
                          ? "Published"
                          : "Draft"}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatEventType(
                        setup.eventType,
                      )}
                    </p>
                  </div>

                  {setup.themeTags.length >
                  0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {setup.themeTags.map(
                        (tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary-strong"
                          >
                            {tag}
                          </span>
                        ),
                      )}
                    </div>
                  ) : null}

                  <p className="text-xs text-muted-foreground">
                    {
                      setup.imageUrls
                        .length
                    }{" "}
                    {setup.imageUrls.length ===
                    1
                      ? "photo"
                      : "photos"}
                  </p>

                  <div className="flex items-center gap-2 border-t border-border pt-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      onClick={() =>
                        startEdit(
                          setup,
                        )
                      }
                      disabled={busy}
                    >
                      <Pencil
                        aria-hidden="true"
                        className="size-4"
                      />

                      Edit
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="ml-auto"
                      aria-label={`Delete ${setup.title}`}
                      onClick={() =>
                        void removeSetup(
                          setup,
                        )
                      }
                      disabled={busy}
                    >
                      <Trash2
                        aria-hidden="true"
                        className="size-4"
                      />
                    </Button>
                  </div>
                </div>
              </article>
            ),
          )}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
          <Images
            aria-hidden="true"
            className="mx-auto size-8 text-muted-foreground"
          />

          <h3 className="mt-3 font-bold">
            No previous setups yet
          </h3>

          <p className="mt-1 text-sm text-muted-foreground">
            Add photos from a completed event to start your setup gallery.
          </p>
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(
          nextOpen,
        ) => {
          if (!busy) {
            setOpen(
              nextOpen,
            );

            if (!nextOpen) {
              setDraft(null);
            }
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {gallery.setups.some(
                (setup) =>
                  setup.id ===
                  draft?.id,
              )
                ? "Edit previous setup"
                : "Add previous setup"}
            </DialogTitle>

            <DialogDescription>
              Add real photos and clear theme details. Customers will only see setups you publish.
            </DialogDescription>
          </DialogHeader>

          {draft ? (
            <div className="grid gap-5">
              <label className="grid gap-2 text-sm font-semibold">
                Setup title *

                <Input
                  value={
                    draft.title
                  }
                  maxLength={120}
                  disabled={busy}
                  placeholder="e.g. Garden Wedding Reception"
                  onChange={(
                    event,
                  ) =>
                    setDraft({
                      ...draft,
                      title:
                        event.target
                          .value,
                    })
                  }
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold">
                Event type *

                <select
                  value={
                    draft.eventType
                  }
                  disabled={busy}
                  onChange={(
                    event,
                  ) =>
                    setDraft({
                      ...draft,

                      eventType:
                        event.target
                          .value as
                          ProviderSetupEventType | "",
                    })
                  }
                  className="flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <option value="">
                    Select event type
                  </option>

                  {PROVIDER_SETUP_EVENT_TYPES.map(
                    (eventType) => (
                      <option
                        key={
                          eventType
                        }
                        value={
                          eventType
                        }
                      >
                        {formatEventType(
                          eventType,
                        )}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-semibold">
                Theme tags

                <Input
                  value={
                    draft.themeTagsText
                  }
                  disabled={busy}
                  placeholder="Garden, Elegant, Green, Gold"
                  onChange={(
                    event,
                  ) =>
                    setDraft({
                      ...draft,

                      themeTagsText:
                        event.target
                          .value,
                    })
                  }
                />

                <span className="text-xs font-normal text-muted-foreground">
                  Separate tags with commas. Maximum {PROVIDER_SETUP_THEME_TAG_LIMIT}.
                </span>
              </label>

              <label className="grid gap-2 text-sm font-semibold">
                Description

                <Textarea
                  rows={4}
                  maxLength={800}
                  disabled={busy}
                  value={
                    draft.description
                  }
                  placeholder="Describe the setup, colors, styling, seating, buffet presentation, or other details..."
                  onChange={(
                    event,
                  ) =>
                    setDraft({
                      ...draft,

                      description:
                        event.target
                          .value,
                    })
                  }
                />
              </label>

              <div className="grid gap-2">
                <p className="text-sm font-semibold">
                  Setup photos
                </p>

                <CatalogImageUploader
                  images={
                    draft.images
                  }
                  onChange={(
                    images,
                  ) =>
                    setDraft({
                      ...draft,
                      images,
                    })
                  }
                  disabled={busy}
                  reorderable
                  maxImages={
                    PROVIDER_SETUP_IMAGE_LIMIT
                  }
                />
              </div>

              <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border p-4">
                <input
                  type="checkbox"
                  checked={
                    draft.isPublished
                  }
                  disabled={busy}
                  onChange={(
                    event,
                  ) =>
                    setDraft({
                      ...draft,

                      isPublished:
                        event.target
                          .checked,
                    })
                  }
                  className="mt-0.5 size-4 accent-primary"
                />

                <span>
                  <span className="block text-sm font-bold">
                    Publish this setup
                  </span>

                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    Published setups appear on your public provider profile and can later be selected as booking inspiration.
                  </span>
                </span>
              </label>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    setOpen(false)
                  }
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void saveDraft()
                  }
                >
                  {busy
                    ? "Saving..."
                    : "Save setup"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function normalizeThemeTags(
  value: string,
): string[] {
  const result =
    new Set<string>();

  for (
    const entry of
      value.split(
        /[,\n]/u,
      )
  ) {
    const normalized =
      entry
        .trim()
        .replace(
          /\s+/gu,
          " ",
        )
        .slice(
          0,
          40,
        );

    if (normalized) {
      result.add(
        normalized,
      );
    }

    if (
      result.size ===
      PROVIDER_SETUP_THEME_TAG_LIMIT
    ) {
      break;
    }
  }

  return [...result];
}

function formatEventType(
  value: string,
): string {
  return value
    .replace(
      /_/gu,
      " ",
    )
    .replace(
      /\b\w/gu,
      (character) =>
        character.toUpperCase(),
    );
}