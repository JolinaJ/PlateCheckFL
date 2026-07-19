import { readFileSync, writeFileSync, existsSync } from "fs";
import type { SourceManifest, SourceManifestEntry } from "../types/dbpr.js";

const MANIFEST_PATH = "data/processed/source-manifest.json";

export function loadManifest(): SourceManifest {
  if (!existsSync(MANIFEST_PATH)) {
    return { entries: [] };
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
}

export function saveManifest(manifest: SourceManifest): void {
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
}

export function addManifestEntry(entry: SourceManifestEntry): void {
  const manifest = loadManifest();
  const idx = manifest.entries.findIndex(
    (e) => e.fileType === entry.fileType && e.district === entry.district
  );
  if (idx >= 0) {
    manifest.entries[idx] = entry;
  } else {
    manifest.entries.push(entry);
  }
  saveManifest(manifest);
}
