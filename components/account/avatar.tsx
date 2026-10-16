"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Up to two initials from the name, else from the part of the email before the @. */
export function initials(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || "";
  const words = source.split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : source.slice(0, 2);
  return letters.toUpperCase() || "?";
}

/**
 * The Google profile picture, or initials when there is none or it fails to
 * load. Decorative: the name is always written next to it.
 */
export function Avatar({
  name,
  email,
  image,
  className,
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const base = cn(
    "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-border-soft",
    className
  );

  if (image && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote Google avatar, no image optimiser config for it
      <img
        src={image}
        alt=""
        aria-hidden
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn(base, "object-cover")}
      />
    );
  }
  return (
    <span aria-hidden className={cn(base, "mono-label text-[11px] text-text-strong")}>
      {initials(name, email)}
    </span>
  );
}
