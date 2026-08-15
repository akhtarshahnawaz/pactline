import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const SAFE_SEGMENT = /[^a-zA-Z0-9_-]/g;

function safeSegment(value: string) {
  return value.replace(SAFE_SEGMENT, "_").slice(0, 120) || "unknown";
}

export function getStorageRoot() {
  // The mount path is only known at runtime (Railway Volume or local .data),
  // so Next's build-time file tracer can't resolve it statically. Every file
  // this path actually needs (public/, drizzle/, scripts/) is already copied
  // explicitly in the Dockerfile, so skip tracing it into the standalone output.
  return path.resolve(
    /*turbopackIgnore: true*/ process.env.RAILWAY_VOLUME_MOUNT_PATH ||
      process.env.UPLOAD_DIR ||
      path.join(process.cwd(), ".data"),
  );
}

function resolveStorageKey(storageKey: string) {
  const root = getStorageRoot();
  const resolved = path.resolve(root, storageKey);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid document storage key.");
  }
  return resolved;
}

export async function persistOriginalFile(input: {
  ownerId: string;
  caseId: string;
  documentId: string;
  extension: string;
  bytes: Buffer;
}) {
  const owner = safeSegment(input.ownerId);
  const caseId = safeSegment(input.caseId);
  const documentId = safeSegment(input.documentId);
  const extension = input.extension.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const storageKey = path.posix.join(
    "uploads",
    owner,
    caseId,
    `${documentId}.${extension}`,
  );
  const destination = resolveStorageKey(storageKey);
  const temporary = `${destination}.${randomUUID()}.tmp`;

  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(temporary, input.bytes, { mode: 0o600, flag: "wx" });
  await rename(temporary, destination);

  return {
    storageKey,
    sha256: createHash("sha256").update(input.bytes).digest("hex"),
  };
}

export async function readOriginalFile(storageKey: string) {
  return readFile(/*turbopackIgnore: true*/ resolveStorageKey(storageKey));
}

export async function deleteOriginalFile(storageKey: string) {
  try {
    await unlink(resolveStorageKey(storageKey));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
