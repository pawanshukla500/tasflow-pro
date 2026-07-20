import { ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "loading"> & {
  /** Prefer WebP when provided (with PNG/JPG fallback via <picture>). */
  webpSrc?: string;
  /** Eager for LCP/brand marks; lazy for below-the-fold media. */
  priority?: boolean;
};

/**
 * Lightweight image helper for Vite (this app is not Next.js).
 * Uses loading/decoding hints and optional WebP sources.
 */
export function OptimizedImage({
  src,
  webpSrc,
  alt = "",
  className,
  priority = false,
  width,
  height,
  ...rest
}: Props) {
  const loading = priority ? "eager" : "lazy";
  const decoding = priority ? "sync" : "async";

  const img = (
    <img
      src={src}
      alt={alt}
      className={cn(className)}
      loading={loading}
      decoding={decoding}
      width={width}
      height={height}
      {...rest}
    />
  );

  if (!webpSrc) return img;

  return (
    <picture>
      <source srcSet={webpSrc} type="image/webp" />
      {img}
    </picture>
  );
}
