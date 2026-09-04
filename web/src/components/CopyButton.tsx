"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label = "Copy link",
  className = "btn",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt("Copy:", text);
        }
      }}
    >
      {done ? "Copied!" : label}
    </button>
  );
}
