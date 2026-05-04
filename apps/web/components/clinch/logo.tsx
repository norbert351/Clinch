import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showDot?: boolean;
}

export function Logo({ className, showDot = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-lg font-semibold text-clinch-text-primary">
        Clinch
      </span>
      {showDot && (
        <span className="h-1.5 w-1.5 rounded-full bg-clinch-accent" />
      )}
    </div>
  );
}
