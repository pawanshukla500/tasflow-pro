import { cn } from "@/lib/utils";

const LOGO_SRC = "/youthnic-logo.png";
const LOGO_SRC_WEBP = "/youthnic-logo.webp";

export type BrandLogoSize = "sm" | "md" | "lg" | "xl";
export type BrandLogoTone = "auto" | "onBrand" | "onLight" | "onDark";

const SIZE: Record<BrandLogoSize, { box: string; img: string }> = {
  sm: { box: "h-8 w-8 rounded-lg", img: "h-4 w-4" },
  md: { box: "h-10 w-10 rounded-xl", img: "h-6 w-6" },
  lg: { box: "h-12 w-12 rounded-xl", img: "h-7 w-7" },
  xl: { box: "h-14 w-14 rounded-2xl", img: "h-8 w-8" },
};

/**
 * Glass chip + monochrome mark that flips with theme.
 * Light → black mark on soft dark glass; dark / brand panel → white mark on white glass.
 */
function chipClasses(tone: BrandLogoTone): string {
  switch (tone) {
    case "onBrand":
    case "onDark":
      return "bg-white/10 ring-1 ring-white/15 shadow-inner";
    case "onLight":
      return "bg-black/[0.04] ring-1 ring-black/10 shadow-inner";
    case "auto":
    default:
      return cn(
        "bg-black/[0.04] ring-1 ring-black/10 shadow-inner",
        "dark:bg-white/10 dark:ring-white/15",
      );
  }
}

function markClasses(tone: BrandLogoTone): string {
  // Logo asset is a dark mark; invert to white on dark/brand surfaces.
  switch (tone) {
    case "onBrand":
    case "onDark":
      return "brightness-0 invert";
    case "onLight":
      return "brightness-0";
    case "auto":
    default:
      return "brightness-0 dark:invert";
  }
}

interface BrandLogoProps {
  size?: BrandLogoSize;
  /** `auto` follows light/dark. Use `onBrand` on teal/primary panels. */
  tone?: BrandLogoTone;
  className?: string;
  imgClassName?: string;
  alt?: string;
}

export function BrandLogo({
  size = "md",
  tone = "auto",
  className,
  imgClassName,
  alt = "TaskFlow Pro",
}: BrandLogoProps) {
  const s = SIZE[size];
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden",
        s.box,
        chipClasses(tone),
        className,
      )}
      aria-hidden={alt ? undefined : true}
    >
      <picture>
        <source srcSet={LOGO_SRC_WEBP} type="image/webp" />
        <img
          src={LOGO_SRC}
          alt={alt}
          width={40}
          height={40}
          decoding="async"
          className={cn("object-contain", s.img, markClasses(tone), imgClassName)}
        />
      </picture>
    </div>
  );
}

interface BrandLockupProps {
  size?: BrandLogoSize;
  tone?: BrandLogoTone;
  title?: string;
  subtitle?: string | null;
  className?: string;
  /** When true, title/subtitle use light text (brand panel). */
  invertedText?: boolean;
}

/** Logo chip + product name (sidebar, login, loading). */
export function BrandLockup({
  size = "md",
  tone = "auto",
  title = "TaskFlow Pro",
  subtitle,
  className,
  invertedText = false,
}: BrandLockupProps) {
  return (
    <div className={cn("flex items-center gap-2.5 min-w-0", className)}>
      <BrandLogo size={size} tone={tone} alt="" />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "font-display font-bold tracking-tight truncate leading-none",
            size === "sm" ? "text-sm" : size === "lg" || size === "xl" ? "text-lg" : "text-sm",
            invertedText ? "text-primary-foreground" : "text-foreground",
          )}
        >
          {title}
        </p>
        {subtitle != null && subtitle !== "" && (
          <p
            className={cn(
              "text-[10px] truncate mt-1 leading-none",
              invertedText ? "text-primary-foreground/75" : "text-muted-foreground",
            )}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
