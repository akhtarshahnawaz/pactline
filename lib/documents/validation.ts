export const acceptedExtensions = new Set([
  "pdf",
  "docx",
  "xlsx",
  "csv",
  "txt",
  "md",
  "json",
  "xml",
  "html",
  "eml",
  "png",
  "jpg",
  "jpeg",
]);

export function extensionFor(filename: string) {
  return filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";
}

export function configuredMaxUploadBytes() {
  const megabytes = Number(process.env.MAX_UPLOAD_MB ?? 25);
  const safeMegabytes = Number.isFinite(megabytes)
    ? Math.min(Math.max(megabytes, 1), 100)
    : 25;
  return safeMegabytes * 1024 * 1024;
}

export function validateUpload(file: File, bytes: Buffer) {
  const extension = extensionFor(file.name);
  if (!acceptedExtensions.has(extension)) {
    throw new Error(`.${extension || "unknown"} files are not supported.`);
  }

  if (file.size === 0) {
    throw new Error("The file is empty.");
  }

  if (file.size > configuredMaxUploadBytes()) {
    throw new Error(
      `The file exceeds the ${Math.round(configuredMaxUploadBytes() / 1024 / 1024)} MB limit.`,
    );
  }

  if (extension === "pdf" && bytes.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error("The file extension is PDF, but the file signature is invalid.");
  }

  if (["docx", "xlsx"].includes(extension) && bytes.subarray(0, 2).toString() !== "PK") {
    throw new Error(`The .${extension} file signature is invalid.`);
  }

  return extension;
}
