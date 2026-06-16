import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type StarRatingProps = {
  // Current value (filled stars). For read-only display this can be fractional.
  value: number;
  // When provided, the widget is interactive and calls back with 1-5.
  onRate?: (stars: number) => void;
  readOnly?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
};

const SIZES = { sm: "w-3.5 h-3.5", md: "w-5 h-5", lg: "w-7 h-7" } as const;

export function StarRating({
  value,
  onRate,
  readOnly = false,
  size = "md",
  className,
  disabled = false,
}: StarRatingProps) {
  const interactive = !readOnly && !!onRate && !disabled;
  const sizeClass = SIZES[size];

  return (
    <div
      className={cn("inline-flex items-center gap-0.5", className)}
      dir="ltr"
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = value >= star - 0.25;
        const StarIcon = (
          <Star
            className={cn(
              sizeClass,
              filled
                ? "fill-amber-400 text-amber-400"
                : "fill-transparent text-muted-foreground/40",
            )}
          />
        );
        if (!interactive) return <span key={star}>{StarIcon}</span>;
        return (
          <button
            key={star}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRate!(star);
            }}
            disabled={disabled}
            className="p-0.5 -m-0.5 transition-transform hover:scale-110 disabled:opacity-50"
            aria-label={`${star}`}
            data-testid={`star-${star}`}
          >
            {StarIcon}
          </button>
        );
      })}
    </div>
  );
}
