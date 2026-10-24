"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {ImageIcon, Trash2, Upload} from "lucide-react";

import {
  FormField,
} from "@/components/forms/form-field";
import {
  ImagePlaceholder,
} from "@/components/shared/image-placeholder";
import {
  Button,
} from "@/components/ui/button";
import {cn} from "@/lib/utils";

export function ProviderBusinessImageField({
  mediaType,
  currentUrl,
  selectedFile,
  disabled,
  error,
  onSelect,
  onRemove,
}: {
  mediaType: "logo" | "cover";
  currentUrl: string | null;
  selectedFile: File | null;
  disabled: boolean;
  error?: string;
  onSelect: (file: File | null) => void;
  onRemove: () => void;
}) {
  const [
    failedSource,
    setFailedSource,
  ] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const label =
    mediaType === "logo"
      ? "Business logo"
      : "Cover photo";

  const selectedPreview = useMemo(
    () =>
      selectedFile
        ? URL.createObjectURL(selectedFile)
        : null,
    [selectedFile],
  );

  useEffect(() => {
    if (!selectedPreview) return;

    return () => {
      URL.revokeObjectURL(
        selectedPreview,
      );
    };
  }, [selectedPreview]);

  useEffect(() => {
    if (!selectedFile && inputRef.current) inputRef.current.value = "";
  }, [currentUrl, error, selectedFile]);

  const previewUrl =
    selectedPreview ??
    currentUrl;

  const previewFailed =
    previewUrl !== null &&
    failedSource === previewUrl;
  const hasImage = Boolean(selectedFile || currentUrl);
  const limitsId = `${inputId}-limits`;
  const selectionId = `${inputId}-selection`;
  const describedBy = [
    limitsId,
    selectedFile ? selectionId : null,
    error ? `${inputId}-error` : null,
  ].filter(Boolean).join(" ");

  function selectFile(file: File | null) {
    setFailedSource(null);
    onSelect(file);
  }

  return (
    <div className="grid min-w-0 content-start gap-3">
      {previewUrl && !previewFailed ? (
        // Public provider images are delivered through Cloudinary.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={`${label} preview`}
          className={
            mediaType === "logo"
              ? "aspect-square w-full max-w-48 rounded-lg border border-border object-cover"
              : "aspect-[16/7] w-full rounded-lg border border-border object-cover"
          }
          onError={() =>
            setFailedSource(
              previewUrl,
            )
          }
        />
      ) : (
        <ImagePlaceholder
          label={`${label} preview unavailable`}
          className={
            mediaType === "logo"
              ? "max-w-48"
              : "aspect-[16/7]"
          }
        />
      )}

      <FormField
        id={inputId}
        label={label}
        error={error}
        disabled={disabled}
      >
        <input
          ref={inputRef}
          id={inputId}
          className="sr-only"
          tabIndex={-1}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error) || undefined}
          onChange={(event) => {
            selectFile(
              event.target.files?.[0] ??
                null,
            );
          }}
        />
        <button
          type="button"
          disabled={disabled}
          aria-label={`${hasImage ? "Change" : "Choose"} ${label.toLowerCase()}`}
          aria-controls={inputId}
          aria-describedby={describedBy}
          className={cn(
            "group flex w-full min-w-0 cursor-pointer flex-wrap items-center gap-3 rounded-xl border border-input bg-card p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:border-input disabled:bg-disabled disabled:opacity-70",
            isDragging && !disabled && "border-primary bg-primary/10 ring-2 ring-primary/20",
            error && "border-destructive",
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            const file = event.dataTransfer.files[0];
            if (!disabled && file) selectFile(file);
          }}
        >
          <span className="pointer-events-none flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-strong">
            {hasImage ? (
              <ImageIcon aria-hidden="true" className="size-5" />
            ) : (
              <Upload aria-hidden="true" className="size-5" />
            )}
          </span>
          <span className="pointer-events-none grid min-w-0 flex-1 basis-32 gap-1">
            <span className="break-all text-sm font-semibold text-foreground">
              {selectedFile?.name ?? (currentUrl ? "Current image" : "Choose image")}
            </span>
            {selectedFile ? (
              <span id={selectionId} className="text-sm text-muted-foreground">
                <span className="sr-only">{selectedFile.name} · </span>
                {selectedFile.size < 1024 * 1024
                  ? `${Math.max(1, Math.round(selectedFile.size / 1024))} KB`
                  : `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                {isDragging ? "Drop image here" : "Click to upload or drag and drop"}
              </span>
            )}
            <span id={limitsId} className="text-xs text-muted-foreground">
              JPEG, PNG, or WebP · Max {mediaType === "logo" ? "5" : "10"} MB
            </span>
          </span>
          {hasImage ? (
            <span className="pointer-events-none text-sm font-semibold text-primary-strong group-hover:underline">
              Change
            </span>
          ) : null}
        </button>
      </FormField>

      {currentUrl || selectedFile ? (
        <Button
          type="button"
          variant="ghost"
          size="compact"
          className="w-fit justify-start px-2 text-destructive hover:bg-destructive/5"
          disabled={disabled}
          onClick={() => {
            setFailedSource(null);
            onRemove();
          }}
          aria-label={`Remove ${label.toLowerCase()}`}
        >
          <Trash2 aria-hidden="true" className="size-4" />
          Remove {label.toLowerCase()}
        </Button>
      ) : null}
    </div>
  );
}
