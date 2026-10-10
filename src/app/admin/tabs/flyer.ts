"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Event flyers (docs/phase-3-contracts.md, Phase 3.1): public bucket, admins-only write. */
export const FLYER_BUCKET = "event-flyers";
export const FLYER_MAX_BYTES = 5 * 1024 * 1024;
export const FLYER_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_EDGE = 1600;

/** Plain-English check of a picked file, or null when it's fine. */
export function flyerFileProblem(file: File): string | null {
  if (!FLYER_TYPES.includes(file.type)) return "Choose a JPG, PNG or WebP image.";
  if (file.size > FLYER_MAX_BYTES) return "That image is bigger than 5 MB. Choose a smaller one.";
  return null;
}

async function loadImage(file: File): Promise<{ img: CanvasImageSource; width: number; height: number; done: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return { img: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close() };
    } catch { /* fall back to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = url;
    });
    return { img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/**
 * Shrinks the image to at most 1600px on the long edge and re-encodes it as
 * WebP (quality 0.85) so flyers load fast on phones. Falls back to the
 * original file if the browser can't do it (or can't encode WebP).
 */
export async function prepareFlyer(file: File): Promise<{ blob: Blob; type: string; ext: string }> {
  const original = { blob: file as Blob, type: file.type, ext: file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg" };
  try {
    const { img, width, height, done } = await loadImage(file);
    try {
      if (!width || !height) return original;
      const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return original;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
      // Some browsers silently fall back to PNG; keep the original then.
      if (!blob || blob.type !== "image/webp" || blob.size > FLYER_MAX_BYTES) return original;
      return { blob, type: "image/webp", ext: "webp" };
    } finally {
      done();
    }
  } catch {
    return original;
  }
}

/** Plain-English message for a Storage error. */
export function storageProblem(error: { message?: string; statusCode?: string | number } | null | undefined): string {
  const msg = (error?.message ?? "").toLowerCase();
  const code = String(error?.statusCode ?? "");
  if (msg.includes("row-level security") || msg.includes("unauthorized") || code === "403" || code === "401") return "Only admins can upload flyers.";
  if (msg.includes("too large") || msg.includes("exceeded the maximum") || code === "413") return "That image is bigger than 5 MB. Choose a smaller one.";
  if (msg.includes("mime") || msg.includes("not supported") || code === "415") return "Choose a JPG, PNG or WebP image.";
  if (msg.includes("bucket not found")) return "Flyer storage isn't set up yet. Please tell the tech team.";
  if (msg.includes("fetch") || msg.includes("network")) return "We couldn't upload the flyer. Check your connection and try again.";
  return "We couldn't upload the flyer. Please try again.";
}

/** Uploads to flyers/{yyyy}/{uuid}.{ext}; returns the public URL and the object path. */
export async function uploadFlyer(
  supabase: SupabaseClient,
  prepared: { blob: Blob; type: string; ext: string },
): Promise<{ ok: true; url: string; path: string } | { ok: false; error: string }> {
  const path = `flyers/${new Date().getFullYear()}/${crypto.randomUUID()}.${prepared.ext}`;
  const { error } = await supabase.storage.from(FLYER_BUCKET).upload(path, prepared.blob, {
    contentType: prepared.type, cacheControl: "31536000", upsert: false,
  });
  if (error) return { ok: false, error: storageProblem(error as { message?: string; statusCode?: string }) };
  const { data } = supabase.storage.from(FLYER_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl?.startsWith("https://")) return { ok: false, error: "We couldn't get a link for the flyer. Please tell the tech team." };
  return { ok: true, url: data.publicUrl, path };
}

/** The object path inside the bucket for one of our public flyer URLs, else null. */
export function flyerPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${FLYER_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return null;
  const path = decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
  return path.startsWith("flyers/") && !path.includes("..") ? path : null;
}

/** Best-effort delete of an old flyer; never throws. */
export async function removeFlyerObject(supabase: SupabaseClient, path: string | null): Promise<void> {
  if (!path) return;
  try {
    await supabase.storage.from(FLYER_BUCKET).remove([path]);
  } catch { /* best effort */ }
}
