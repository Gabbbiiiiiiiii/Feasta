"use client";

import {useEffect, useMemo, useState} from "react";

import {FormField} from "@/components/forms/form-field";
import {ImagePlaceholder} from "@/components/shared/image-placeholder";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {providerMediaPreviewUrl} from "@/lib/provider/provider-media-client";

export function ProviderBusinessImageField({
  mediaType,
  currentPath,
  selectedFile,
  disabled,
  error,
  onSelect,
  onRemove,
}: {
  mediaType: "logo" | "cover";
  currentPath: string | null;
  selectedFile: File | null;
  disabled: boolean;
  error?: string;
  onSelect: (file: File | null) => void;
  onRemove: () => void;
}) {
  const [storedPreview, setStoredPreview] = useState<{
    path: string;
    url: string;
  } | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const label = mediaType === "logo" ? "Business logo" : "Cover photo";
  const selectedPreview = useMemo(
    () => selectedFile ? URL.createObjectURL(selectedFile) : null,
    [selectedFile],
  );

  useEffect(() => {
    if (!selectedPreview) return;
    return () => URL.revokeObjectURL(selectedPreview);
  }, [selectedPreview]);

  useEffect(() => {
    if (!currentPath || selectedFile) return;
    let active = true;
    void providerMediaPreviewUrl(currentPath)
      .then((url) => {
        if (active) setStoredPreview({path: currentPath, url});
      })
      .catch(() => {
        if (active) setFailedSource(currentPath);
      });
    return () => {
      active = false;
    };
  }, [currentPath, selectedFile]);
  const previewUrl = selectedPreview ??
    (storedPreview?.path === currentPath ? storedPreview.url : null);
  const previewFailed = previewUrl
    ? failedSource === previewUrl
    : failedSource === currentPath;

  return (
    <div className="grid min-w-0 gap-3">
      {previewUrl && !previewFailed ? (
        // The URL is issued by Firebase Storage for an owner-controlled image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={`${label} preview`}
          className={
            mediaType === "logo"
              ? "aspect-square w-full max-w-48 rounded-lg border border-border object-cover"
              : "aspect-[16/7] w-full rounded-lg border border-border object-cover"
          }
          onError={() => setFailedSource(previewUrl)}
        />
      ) : (
        <ImagePlaceholder
          label={`${label} preview unavailable`}
          className={mediaType === "logo" ? "max-w-48" : "aspect-[16/7]"}
        />
      )}
      <FormField
        label={label}
        description={`JPEG, PNG, or WebP. Maximum ${
          mediaType === "logo" ? "5" : "10"
        } MB.`}
        error={error}
        disabled={disabled}
      >
        <Input
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={(event) => onSelect(event.target.files?.[0] ?? null)}
        />
      </FormField>
      {(currentPath || selectedFile) ? (
        <Button
          type="button"
          variant="secondary"
          size="compact"
          className="w-full sm:w-fit"
          disabled={disabled}
          onClick={onRemove}
          aria-label={`Remove ${label.toLowerCase()}`}
        >
          Remove {label.toLowerCase()}
        </Button>
      ) : null}
    </div>
  );
}
