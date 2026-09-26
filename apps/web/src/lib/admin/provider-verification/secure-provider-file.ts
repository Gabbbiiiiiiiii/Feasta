import "server-only";

import {adminStorage} from "@/lib/firebase/admin";

const safeFileNamePattern = /[^A-Za-z0-9._ -]+/gu;

export async function secureStorageFileResponse({
  storagePath,
  fileName,
  disposition,
  allowedContentTypes,
  maximumBytes,
}: {
  storagePath: string;
  fileName: string;
  disposition: "inline" | "attachment";
  allowedContentTypes: readonly string[];
  maximumBytes: number;
}): Promise<Response> {
  try {
    const file = adminStorage.bucket().file(storagePath);
    const [metadata] = await file.getMetadata();
    const contentType = String(metadata.contentType ?? "");
    const size = Number(metadata.size);
    if (
      !allowedContentTypes.includes(contentType) ||
      !Number.isFinite(size) ||
      size <= 0 ||
      size > maximumBytes
    ) {
      return new Response("The file is unavailable.", {status: 404});
    }
    const [contents] = await file.download();
    const safeFileName = fileName
      .replace(safeFileNamePattern, "_")
      .trim()
      .slice(0, 120) || "document";
    return new Response(new Uint8Array(contents), {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `${disposition}; filename="${safeFileName}"`,
        "Content-Length": String(contents.byteLength),
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("The file is unavailable.", {status: 404});
  }
}
