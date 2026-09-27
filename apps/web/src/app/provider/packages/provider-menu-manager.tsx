"use client";

import Image from "next/image";

import {
  useEffect,
  useState,
} from "react";
import {
  Camera,
  Edit3,
  Images,
  Plus,
  Trash2,
} from "lucide-react";

import {
  CatalogImageUploader,
  uploadCatalogImages,
} from "@/components/provider/catalog-image-uploader";
import {
  StatusBadge,
} from "@/components/shared/status-badge";
import {
  Button,
} from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Input,
} from "@/components/ui/input";
import {
  Select,
} from "@/components/ui/select";
import {
  Textarea,
} from "@/components/ui/textarea";
import type {
  CatalogImageDraft,
} from "@/lib/provider/catalog-media";
import type {
  ProviderMenu,
  ProviderMenuImage,
  ProviderMenuServingOption,
} from "@/lib/provider/provider-menu";

import {
  loadProviderMenuAction,
  saveProviderMenuAction,
} from "./menu-actions";

type ServingOptionDraft = {
  id: string;
  name: string;
  description: string;
  minimumGuests: string;
  maximumGuests: string;
  price: string;
};

type MenuDetailsDraft = {
  description: string;
  category: string;
  servingOptions:
    ServingOptionDraft[];
};

export function ProviderMenuManager() {
  const [
    menu,
    setMenu,
  ] = useState<ProviderMenu>({
    revision: 0,
    images: [],
  });

  const [
    images,
    setImages,
  ] = useState<
    CatalogImageDraft[]
  >([]);

  const [
    details,
    setDetails,
  ] = useState<
    Record<
      string,
      MenuDetailsDraft
    >
  >({});

  const [
    published,
    setPublished,
  ] = useState<
    Set<string>
  >(new Set());

  const [
    open,
    setOpen,
  ] = useState(false);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);

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
  ] = useState<
    string | null
  >(null);

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    categoryFilter,
    setCategoryFilter,
  ] = useState("");

  const categories = [
    ...new Set(
      menu.images
        .map(
          (image) =>
            image.category?.trim() ??
            "",
        )
        .filter(Boolean),
    ),
  ].sort();

  const normalizedSearch =
    search
      .trim()
      .toLowerCase();

  const filteredImages =
    menu.images.filter(
      (image) => {
        const matchesCategory =
          !categoryFilter ||
          image.category ===
            categoryFilter;

        const searchable = [
          image.title,
          image.description ?? "",
          image.category ?? "",
          ...(image.servingOptions ?? [])
            .flatMap(
              (option) => [
                option.name,
                option.description,
              ],
            ),
        ]
          .join(" ")
          .toLowerCase();

        return (
          matchesCategory &&
          (
            !normalizedSearch ||
            searchable.includes(
              normalizedSearch,
            )
          )
        );
      },
    );

  useEffect(() => {
    let active = true;

    loadProviderMenuAction()
      .then(
        (loaded) => {
          if (active) {
            setMenu(loaded);
          }
        },
      )
      .catch(() => {
        if (active) {
          setError(
            "Your menu could not be loaded. Try reopening the editor.",
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

  async function startEditing(imageId?: string) {
    setError(null);

    // Existing items are already loaded.
    // Editing one item should not reload or disable the whole catalog.
    if (imageId !== undefined) {
      const image =
        menu.images.find(
          (candidate) =>
            candidate.id === imageId,
        );

      if (!image) {
        setError(
          "This menu item could not be found. Refresh the page and try again.",
        );
        return;
      }

      setEditingItemId(image.id);

      setImages([
        {
          id: image.id,
          title: image.title,
          url: image.url,
        },
      ]);

      setDetails({
        [image.id]:
          menuDetailsFromImage(image),
      });

      setPublished(
        new Set(
          image.isPublished
            ? [image.id]
            : [],
        ),
      );

      setOpen(true);
      return;
    }

    // Add Menu Items still refreshes the complete menu.
    setLoading(true);

    try {
      const loaded =
        await loadProviderMenuAction();

      setMenu(loaded);
      setEditingItemId(null);

      setImages(
        loaded.images.map(
          (image) => ({
            id: image.id,
            title: image.title,
            url: image.url,
          }),
        ),
      );

      setDetails(
        Object.fromEntries(
          loaded.images.map(
            (image) => [
              image.id,
              menuDetailsFromImage(image),
            ],
          ),
        ),
      );

      setPublished(
        new Set(
          loaded.images
            .filter(
              (image) =>
                image.isPublished,
            )
            .map(
              (image) =>
                image.id,
            ),
        ),
      );

      setOpen(true);
    }
    catch (caught) {
      setEditingItemId(null);

      setError(
        caught instanceof Error
          ? caught.message
          : "Your menu could not be loaded. Please try again.",
      );
    }
    finally {
      setLoading(false);
    }
  }
  function updateDetails(
    imageId: string,
    update: (
      current:
        MenuDetailsDraft,
    ) => MenuDetailsDraft,
  ) {
    setDetails(
      (current) => {
        const existing =
          current[imageId] ??
          emptyMenuDetails();

        return {
          ...current,
          [imageId]:
            update(existing),
        };
      },
    );
  }

  function addServingOption(
    imageId: string,
  ) {
    updateDetails(
      imageId,
      (current) => ({
        ...current,
        servingOptions: [
          ...current.servingOptions,
          {
            id:
              crypto.randomUUID(),
            name: "",
            description: "",
            minimumGuests: "",
            maximumGuests: "",
            price: "",
          },
        ],
      }),
    );
  }

  function updateServingOption(
    imageId: string,
    optionId: string,
    update: Partial<
      ServingOptionDraft
    >,
  ) {
    updateDetails(
      imageId,
      (current) => ({
        ...current,
        servingOptions:
          current.servingOptions.map(
            (option) =>
              option.id === optionId
                ? {
                    ...option,
                    ...update,
                  }
                : option,
          ),
      }),
    );
  }

  function removeServingOption(
    imageId: string,
    optionId: string,
  ) {
    updateDetails(
      imageId,
      (current) => ({
        ...current,
        servingOptions:
          current.servingOptions.filter(
            (option) =>
              option.id !== optionId,
          ),
      }),
    );
  }

  async function saveMenu() {
    setBusy(true);
    setError(null);

    try {
      const uploaded =
        await uploadCatalogImages(
          images,
          (saved) =>
            setImages(
              (current) =>
                current.map(
                  (image) =>
                    image.id === saved.id
                      ? saved
                      : image,
                ),
            ),
        );

      const payload =
        uploaded.map(
          (image) =>
            menuImageForSave(
              image,
              published.has(
                image.id,
              ),
              details[image.id],
            ),
        );

      const completePayload =
        editingItemId === null
          ? payload
          : menu.images.flatMap(
              (image) =>
                image.id === editingItemId
                  ? payload
                  : [image],
            );
      const result =
        await saveProviderMenuAction({
          revision:
            menu.revision,
          images: completePayload,
        });

      if (!result.ok) {
        throw new Error(
          result.error,
        );
      }

      setMenu(result.menu);
      setEditingItemId(null);
      setSearch("");
      setCategoryFilter("");
      setOpen(false);
    }
    catch (caught) {
      setError(
        caught instanceof Error
          ? (
              caught.message ===
              "Menu image verification is not configured. Contact FEASTA support."
                ? "Menu uploads need server configuration. Contact FEASTA support, then retry saving."
                : caught.message
            )
          : "The menu could not be saved.",
      );
    }
    finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="provider-menu-heading"
      className="grid min-w-0 gap-4 border-t border-border pt-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="provider-menu-heading"
            className="text-xl font-bold"
          >
            Menu & Catalog
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Create catering menu items with descriptions, categories,
            serving sizes, guest coverage, and prices.
          </p>
        </div>

        <Dialog
          open={open}
          onOpenChange={
            (next) => {
              if (
                !busy &&
                !next
              ) {
                setOpen(false);
              }
            }
          }
        >
          <DialogTrigger
            asChild
          >
            <Button
              type="button"
              disabled={loading}
              onClick={
                () =>
                  void startEditing()
              }
            >
              <Plus
                aria-hidden="true"
                className="size-4"
              />
              Add menu items
            </Button>
          </DialogTrigger>

          <DialogContent
            className="flex max-h-[calc(100dvh-2rem)] min-w-0 max-w-[70rem] flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100%-3rem)]"
            showCloseButton={
              !busy
            }
            onEscapeKeyDown={
              (event) => {
                if (busy) {
                  event.preventDefault();
                }
              }
            }
            onPointerDownOutside={
              (event) =>
                event.preventDefault()
            }
          >
            <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-16">
              <DialogTitle>
                Catering menu items
              </DialogTitle>

              <DialogDescription>
                Add food photos, item details, and serving-size options.
                A menu item needs at least one serving size before customers
                can add it to their Event List.
              </DialogDescription>
            </DialogHeader>

            <div
              role="region"
              aria-label="Menu item details"
              tabIndex={0}
              className="mx-2 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 [scrollbar-gutter:stable] [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >              {editingItemId === null ? (

              <CatalogImageUploader
                images={images}
                onChange={setImages}
                disabled={busy}
                titles
                maxImages={null}
                reorderable={false}
                publication={{
                  published,
                  onChange:
                    (
                      id,
                      checked,
                    ) =>
                      setPublished(
                        (current) => {
                          const next =
                            new Set(
                              current,
                            );

                          if (checked) {
                            next.add(id);
                          }
                          else {
                            next.delete(id);
                          }

                          return next;
                        },
                      ),
                }}
              />
              ) : null}

              {images.length >
              0 ? (
                <div className="mt-6 grid gap-4">
                  <div>
                    <h3 className="text-base font-bold">
                      Serving details
                    </h3>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Add at least one serving size to make an item
                      selectable in the customer custom catering menu.
                    </p>
                  </div>

                  {images.map(
                    (
                      image,
                      imageIndex,
                    ) => {
                      const current =
                        details[
                          image.id
                        ] ??
                        emptyMenuDetails();

                      return (
                        <section
                          key={
                            image.id
                          }
                          aria-label={`Menu item ${
                            imageIndex +
                            1
                          } details`}
                          className="grid gap-4 rounded-xl border border-border bg-card p-4"
                        >
                          <div>
                            <h4 className="break-words font-bold">
                              {image.title.trim() ||
                                `Menu item ${
                                  imageIndex +
                                  1
                                }`}
                            </h4>
                            <div className="grid gap-4">
                              <div className="grid gap-2">
                                <span className="text-sm font-semibold">
                                  Menu image
                                </span>

                                <div className="flex flex-wrap items-center gap-5 rounded-[20px] border border-border bg-card p-4 shadow-sm">
                                  <div className="relative h-32 w-40 shrink-0 overflow-hidden rounded-[18px] border border-border bg-muted">
                                    <Image
                                    src={image.url}
                                    alt={
                                      image.title ||
                                      "Menu item"
                                    }
                                    width={144}
                                    height={112}
                                    unoptimized
                                    className="h-full w-full object-cover"
                                  />

                                    <label
                                      className="absolute bottom-2.5 right-2.5 flex size-11 cursor-pointer items-center justify-center rounded-full border border-white/30 bg-black/55 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/70 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
                                      title="Change menu image"
                                    >
                                      <Camera
                                        aria-hidden="true"
                                        className="size-5"
                                      />

                                      <span className="sr-only">
                                        Change image
                                      </span>

                                      <input
                                        className="sr-only"
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        disabled={busy}
                                        onChange={(event) => {
                                          const file =
                                            event.currentTarget.files?.[0];

                                          event.currentTarget.value =
                                            "";

                                          if (!file) {
                                            return;
                                          }

                                          const allowedTypes =
                                            new Set([
                                              "image/jpeg",
                                              "image/png",
                                              "image/webp",
                                            ]);

                                          if (
                                            !allowedTypes.has(
                                              file.type,
                                            )
                                          ) {
                                            setError(
                                              "Use a JPEG, PNG, or WebP image.",
                                            );
                                            return;
                                          }

                                          if (
                                            file.size <= 0 ||
                                            file.size >
                                              5 * 1024 * 1024
                                          ) {
                                            setError(
                                              "The menu image must be no larger than 5 MB.",
                                            );
                                            return;
                                          }

                                          const reader =
                                            new FileReader();

                                          reader.onload =
                                            () => {
                                              const preview =
                                                reader.result;

                                              if (
                                                typeof preview !==
                                                "string"
                                              ) {
                                                setError(
                                                  "The selected image could not be previewed.",
                                                );
                                                return;
                                              }

                                              setImages(
                                                (
                                                  currentImages,
                                                ) =>
                                                  currentImages.map(
                                                    (
                                                      currentImage,
                                                    ) =>
                                                      currentImage.id ===
                                                      image.id
                                                        ? {
                                                            ...currentImage,
                                                            url: preview,
                                                            file,
                                                          }
                                                        : currentImage,
                                                  ),
                                              );

                                              setError(null);
                                            };

                                          reader.onerror =
                                            () => {
                                              setError(
                                                "The selected image could not be read.",
                                              );
                                            };

                                          reader.readAsDataURL(
                                            file,
                                          );
                                        }}
                                      />
                                    </label>
                                  </div>

                                  <p className="text-sm text-muted-foreground">
                                    JPEG, PNG, or WebP · Maximum 5 MB
                                  </p>
                                </div>
                              </div>

                              <label className="grid gap-1 text-sm font-semibold">
                                Item name

                                <Input
                                  value={image.title}
                                  maxLength={80}
                                  disabled={busy}
                                  onChange={(event) => {
                                    const value =
                                      event.target.value;

                                    setImages(
                                      (
                                        currentImages,
                                      ) =>
                                        currentImages.map(
                                          (
                                            currentImage,
                                          ) =>
                                            currentImage.id ===
                                            image.id
                                              ? {
                                                  ...currentImage,
                                                  title:
                                                    value,
                                                }
                                              : currentImage,
                                        ),
                                    );
                                  }}
                                />
                              </label>
                            </div>
                          </div>

                          <div className="grid gap-4 lg:grid-cols-2">
                            <label className="grid gap-1.5 text-sm font-semibold">
                              Category

                              <Input
                                value={
                                  current.category
                                }
                                maxLength={
                                  80
                                }
                                disabled={
                                  busy
                                }
                                placeholder="e.g. Beef, Chicken, Pasta"
                                onChange={
                                  (
                                    event,
                                  ) =>
                                    updateDetails(
                                      image.id,
                                      (
                                        value,
                                      ) => ({
                                        ...value,
                                        category:
                                          event
                                            .target
                                            .value,
                                      }),
                                    )
                                }
                              />
                            </label>

                            <label className="grid gap-1.5 text-sm font-semibold lg:col-span-2">
                              Description

                              <Textarea
                                value={
                                  current.description
                                }
                                maxLength={
                                  600
                                }
                                disabled={
                                  busy
                                }
                                rows={3}
                                className="min-h-24"
                                placeholder="Describe the dish, ingredients, preparation, or other useful details."
                                onChange={
                                  (
                                    event,
                                  ) =>
                                    updateDetails(
                                      image.id,
                                      (
                                        value,
                                      ) => ({
                                        ...value,
                                        description:
                                          event
                                            .target
                                            .value,
                                      }),
                                    )
                                }
                              />
                            </label>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                            <div>
                              <h5 className="text-sm font-bold">
                                Serving sizes
                              </h5>

                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Examples: Family Size, Party Size, Tray.
                              </p>
                            </div>

                            <Button
                              type="button"
                              variant="secondary"
                              size="compact"
                              disabled={
                                busy ||
                                current
                                  .servingOptions
                                  .length >=
                                  8
                              }
                              onClick={
                                () =>
                                  addServingOption(
                                    image.id,
                                  )
                              }
                            >
                              <Plus
                                aria-hidden="true"
                                className="size-4"
                              />
                              Add serving size
                            </Button>
                          </div>

                          {current
                            .servingOptions
                            .length ===
                          0 ? (
                            <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                              No serving sizes yet. This item can remain
                              published as browsing-only content, but customers
                              cannot add it to a custom catering Event List
                              until a serving size is configured.
                            </div>
                          ) : (
                            <div className="grid gap-3">
                              {current.servingOptions.map(
                                (
                                  option,
                                  optionIndex,
                                ) => (
                                  <div
                                    key={
                                      option.id
                                    }
                                    role="group"
                                    aria-label={`Serving size ${
                                      optionIndex +
                                      1
                                    } for ${
                                      image.title ||
                                      `menu item ${
                                        imageIndex +
                                        1
                                      }`
                                    }`}
                                    className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="text-sm font-bold">
                                        Serving size{" "}
                                        {optionIndex +
                                          1}
                                      </p>

                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        disabled={
                                          busy
                                        }
                                        aria-label={`Remove serving size ${
                                          optionIndex +
                                          1
                                        }`}
                                        title="Remove serving size"
                                        onClick={
                                          () =>
                                            removeServingOption(
                                              image.id,
                                              option.id,
                                            )
                                        }
                                      >
                                        <Trash2
                                          aria-hidden="true"
                                          className="size-4"
                                        />
                                      </Button>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                      <label className="grid gap-1.5 text-sm font-semibold">
                                        Serving size name *

                                        <Input
                                          value={
                                            option.name
                                          }
                                          maxLength={
                                            80
                                          }
                                          disabled={
                                            busy
                                          }
                                          placeholder="Family Size"
                                          onChange={
                                            (
                                              event,
                                            ) =>
                                              updateServingOption(
                                                image.id,
                                                option.id,
                                                {
                                                  name:
                                                    event
                                                      .target
                                                      .value,
                                                },
                                              )
                                          }
                                        />
                                      </label>

                                      <label className="grid gap-1.5 text-sm font-semibold">
                        Minimum guests *

                        <Input
                          type="number"
                          min="1"
                          max="1000000"
                          step="1"
                          inputMode="numeric"
                          value={
                            option.minimumGuests
                          }
                          disabled={
                            busy
                          }
                          placeholder="15"
                          onChange={
                            (
                              event,
                            ) =>
                              updateServingOption(
                                image.id,
                                option.id,
                                {
                                  minimumGuests:
                                    event
                                      .target
                                      .value,
                                },
                              )
                          }
                        />
                      </label>

                      <label className="grid gap-1.5 text-sm font-semibold">
                        Maximum guests *

                        <Input
                          type="number"
                          min="1"
                          max="1000000"
                          step="1"
                          inputMode="numeric"
                          value={
                            option.maximumGuests
                          }
                          disabled={
                            busy
                          }
                          placeholder="20"
                          onChange={
                            (
                              event,
                            ) =>
                              updateServingOption(
                                image.id,
                                option.id,
                                {
                                  maximumGuests:
                                    event
                                      .target
                                      .value,
                                },
                              )
                          }
                        />
                      </label>

                                      <label className="grid gap-1.5 text-sm font-semibold">
                                        Price (₱) *

                                        <Input
                                          type="number"
                                          min="0.01"
                                          step="0.01"
                                          inputMode="decimal"
                                          value={
                                            option.price
                                          }
                                          disabled={
                                            busy
                                          }
                                          placeholder="1050"
                                          onChange={
                                            (
                                              event,
                                            ) =>
                                              updateServingOption(
                                                image.id,
                                                option.id,
                                                {
                                                  price:
                                                    event
                                                      .target
                                                      .value,
                                                },
                                              )
                                          }
                                        />
                                      </label>

                                      <label className="grid gap-1.5 text-sm font-semibold">
                                        Serving notes (optional)

                                        <Input
                                          value={
                                            option.description
                                          }
                                          maxLength={
                                            160
                                          }
                                          disabled={
                                            busy
                                          }
                                          placeholder="Optional details about this serving size"
                                          onChange={
                                            (
                                              event,
                                            ) =>
                                              updateServingOption(
                                                image.id,
                                                option.id,
                                                {
                                                  description:
                                                    event
                                                      .target
                                                      .value,
                                                },
                                              )
                                          }
                                        />
                                      </label>
                                    </div>
                                  </div>
                                ),
                              )}
                            </div>
                          )}
                        </section>
                      );
                    },
                  )}
                </div>
              ) : null}
            </div>

            <div className="grid shrink-0 gap-3 border-t border-border bg-card px-5 py-4">
              {error ? (
                <p
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={
                    () =>
                      setOpen(
                        false,
                      )
                  }
                >
                  Cancel
                </Button>

                <Button
                  loading={busy}
                  loadingLabel="Saving menu"
                  disabled={busy}
                  onClick={
                    () =>
                      void saveMenu()
                  }
                >
                  Save menu
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {!open &&
      error ? (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {menu.images.length >
      0 ? (
        <div
          role="search"
          aria-label="Filter menu items"
          className="flex flex-wrap items-end gap-3"
        >
          <label className="grid min-w-0 flex-1 basis-64 gap-1 text-sm font-semibold">
            Search menu items

            <Input
              type="search"
              placeholder="Search menu items..."
              value={search}
              onChange={
                (event) =>
                  setSearch(
                    event.target
                      .value,
                  )
              }
            />
          </label>

          {categories.length >
          0 ? (
            <label className="grid min-w-0 flex-1 basis-48 gap-1 text-sm font-semibold">
              Category

              <Select
                value={
                  categoryFilter
                }
                onChange={
                  (event) =>
                    setCategoryFilter(
                      event.target
                        .value,
                    )
                }
              >
                <option value="">
                  All
                </option>

                {categories.map(
                  (category) => (
                    <option
                      key={
                        category
                      }
                      value={
                        category
                      }
                    >
                      {category}
                    </option>
                  ),
                )}
              </Select>
            </label>
          ) : null}

          {search ||
          categoryFilter ? (
            <Button
              variant="ghost"
              size="compact"
              onClick={
                () => {
                  setSearch("");
                  setCategoryFilter("");
                }
              }
            >
              Clear menu filters
            </Button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <p
          role="status"
          className="text-sm text-muted-foreground"
        >
          Loading menu…
        </p>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15.5rem),1fr))] items-start gap-4">
        {filteredImages.map(
          (
            image,
            index,
          ) => {
            const minimumPrice =
              minimumServingPrice(
                image,
              );

            return (
              <article
                key={image.id}
                aria-label={
                  image.title ||
                  `Menu image ${
                    menu.images.indexOf(
                      image,
                    ) + 1
                  }`
                }
                className="min-w-0 self-start overflow-hidden rounded-card border border-border bg-card shadow-card"
              >
                <div className="relative h-48 overflow-hidden bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={
                      image.title ||
                      `Menu image ${
                        menu.images.indexOf(
                          image,
                        ) + 1
                      }`
                    }
                    className="absolute inset-0 size-full object-contain"
                    loading="lazy"
                  />

                  <div className="absolute right-2 top-2">
                    <StatusBadge
                      status={
                        image.isPublished
                          ? "published"
                          : "draft"
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-2 p-3">
                  <h3 className="line-clamp-2 break-words text-base font-bold">
                    {image.title ||
                      `Menu image ${
                        menu.images.indexOf(
                          image,
                        ) + 1
                      }`}
                  </h3>

                  {image.category ? (
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary-strong">
                      {image.category}
                    </p>
                  ) : null}

                  {minimumPrice !==
                  null ? (
                    <p className="text-sm font-bold text-primary-strong">
                      From{" "}
                      {formatPrice(
                        minimumPrice,
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Browsing only · Add serving sizes to enable
                      customer selection.
                    </p>
                  )}

                  {image.description ? (
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {image.description}
                    </p>
                  ) : null}

                  {(image.servingOptions
                    ?.length ??
                    0) >
                  0 ? (
                    <p className="text-xs text-muted-foreground">
                      {
                        image
                          .servingOptions!
                          .length
                      }{" "}
                      serving{" "}
                      {image
                        .servingOptions!
                        .length ===
                      1
                        ? "size"
                        : "sizes"}
                    </p>
                  ) : null}
                </div>

                <div className="border-t border-border p-2">
                  <Button
                    variant="secondary"
                    size="compact"
                    disabled={loading}
                    aria-label={`Edit ${
                      image.title ||
                      `menu image ${
                        index + 1
                      }`
                    }`}
                    onClick={
                      () =>
                        void startEditing(image.id)
                    }
                  >
                    <Edit3
                      aria-hidden="true"
                      className="size-4"
                    />
                    Edit
                  </Button>
                </div>
              </article>
            );
          },
        )}
      </div>

      {!loading &&
      !error &&
      menu.images.length ===
        0 ? (
        <div className="grid justify-items-center gap-3 rounded-card border border-dashed border-border bg-card px-5 py-10 text-center">
          <Images
            aria-hidden="true"
            className="size-8 text-primary-strong"
          />

          <p className="text-sm text-muted-foreground">
            No menu items yet. Add food photos or menu posters and
            configure serving sizes for custom catering.
          </p>
        </div>
      ) : null}

      {!loading &&
      !error &&
      menu.images.length >
        0 &&
      filteredImages.length ===
        0 ? (
        <p
          role="status"
          className="py-6 text-sm text-muted-foreground"
        >
          No menu items match your filters.
        </p>
      ) : null}
    </section>
  );
}

function menuDetailsFromImage(
  image: ProviderMenuImage,
): MenuDetailsDraft {
  return {
    description:
      image.description ?? "",
    category:
      image.category ?? "",
    servingOptions:
      (
        image.servingOptions ??
        []
      ).map(
        (option) => ({
          id: option.id,
          name: option.name,
          description:
            option.description,
          minimumGuests:
            String(
              option.minimumGuests,
            ),
          maximumGuests:
            String(
              option.maximumGuests,
            ),
          price:
            String(
              option.price,
            ),
        }),
      ),
  };
}

function emptyMenuDetails():
MenuDetailsDraft {
  return {
    description: "",
    category: "",
    servingOptions: [],
  };
}

function menuImageForSave(
  image: CatalogImageDraft,
  isPublished: boolean,
  details:
    | MenuDetailsDraft
    | undefined,
): ProviderMenuImage {
  const base:
    ProviderMenuImage = {
      id: image.id,
      title:
        image.title.trim(),
      url: image.url,
      isPublished,
    };

  const current =
    details ??
    emptyMenuDetails();

  const description =
    current.description.trim();

  const category =
    current.category.trim();

  const servingOptions =
    current.servingOptions.map(
      (
        option,
        index,
      ) =>
        servingOptionForSave(
          option,
          base.title,
          index,
        ),
    );

  /*
   * Keep untouched historical browsing-only menu images in
   * their exact legacy shape.
   */
  if (
    !description &&
    !category &&
    servingOptions.length ===
      0
  ) {
    return base;
  }

  if (
    servingOptions.length >
      0 &&
    !base.title
  ) {
    throw new Error(
      "Enter an item name before adding serving sizes.",
    );
  }

  return {
    ...base,
    description,
    category,
    servingOptions,
  };
}

function servingOptionForSave(
  option: ServingOptionDraft,
  itemName: string,
  index: number,
): ProviderMenuServingOption {
  const name =
    option.name
      .trim();

  const description =
    option.description
      .trim();

  const minimumGuests =
    Number(
      option.minimumGuests,
    );

  const maximumGuests =
    Number(
      option.maximumGuests,
    );

  const price =
    Number(
      option.price,
    );

  const label =
    itemName ||
    "this menu item";

  if (!name) {
    throw new Error(
      `Enter the serving size name for ${label}, option ${index + 1}.`,
    );
  }

  if (
    !Number.isSafeInteger(
      minimumGuests,
    ) ||
    minimumGuests < 1 ||
    minimumGuests > 1_000_000
  ) {
    throw new Error(
      `Enter a valid minimum guest count for serving size "${name}".`,
    );
  }

  if (
    !Number.isSafeInteger(
      maximumGuests,
    ) ||
    maximumGuests < 1 ||
    maximumGuests > 1_000_000
  ) {
    throw new Error(
      `Enter a valid maximum guest count for serving size "${name}".`,
    );
  }

  if (
    maximumGuests <
      minimumGuests
  ) {
    throw new Error(
      `Maximum guests for serving size "${name}" must be greater than or equal to minimum guests.`,
    );
  }

  if (
    !Number.isFinite(
      price,
    ) ||
    price <= 0
  ) {
    throw new Error(
      `Enter a valid price for serving size "${name}".`,
    );
  }

  return {
    id: option.id,
    name,
    description,
    minimumGuests,
    maximumGuests,
    price:
      Math.round(
        (
          price +
          Number.EPSILON
        ) *
          100,
      ) / 100,
  };
}

function minimumServingPrice(
  image: ProviderMenuImage,
): number | null {
  const prices =
    (
      image.servingOptions ??
      []
    )
      .map(
        (option) =>
          option.price,
      )
      .filter(
        (price) =>
          Number.isFinite(
            price,
          ) &&
          price > 0,
      );

  return prices.length
    ? Math.min(
        ...prices,
      )
    : null;
}

function formatPrice(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-PH",
    {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    },
  ).format(value);
}
