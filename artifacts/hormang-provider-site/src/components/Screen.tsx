import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = { src: string; alt: string; w: number; h: number; eager?: boolean; className?: string };

/** Image with a same-ratio placeholder if the file is missing. */
export function Screen({ src, alt, w, h, eager, className }: Props) {
  const [failed, setFailed] = useState(false);
  const style = { aspectRatio: `${w} / ${h}` };

  if (failed)
    return (
      <div
        style={style}
        className={cn(
          "flex w-full items-center justify-center bg-border/60 p-2 text-center text-[10px] text-muted-foreground",
          className,
        )}
        role="img"
        aria-label={alt}
      >
        {src.split("/").pop()}
      </div>
    );

  return (
    <img
      src={src}
      alt={alt}
      width={w}
      height={h}
      style={style}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("block w-full object-cover", className)}
    />
  );
}

export function Phone({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[40px] bg-bezel p-[7px] shadow-phone", className)}>
      <div className="overflow-hidden rounded-[33px] bg-background">{children}</div>
    </div>
  );
}
