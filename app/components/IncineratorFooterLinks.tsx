"use client";

import { BookOpen, Github } from "lucide-react";

export function IncineratorFooterLinks() {
  return (
    <div className="w-full max-w-xl mx-auto px-4 sm:px-0 pt-10 pb-8">
      <div className="flex justify-center">
        <div
          className="flex items-center gap-4 rounded-full border border-white/15 bg-white/5 px-6 py-3 shadow-lg"
          style={{
            paddingInline: "calc(var(--spacing) * 2)",
            paddingBlock: "calc(var(--spacing) * 2)",
          }}
        >
          {/* X / Twitter */}
          <a
            href="#"
            target="_blank"
            rel="noreferrer"
            aria-label="Open X"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 hover:bg-white hover:text-black transition-colors"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4 fill-current"
            >
              <path d="M18.244 2H21.6l-7.44 8.51L22.8 22h-6.67l-5.22-6.8L5.48 22H2.12l7.96-9.11L1.2 2h6.87l4.73 6.15L18.244 2z" />
            </svg>
          </a>

          {/* Docs / GitBook */}
          <a
            href="#"
            target="_blank"
            rel="noreferrer"
            aria-label="Open documentation"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 hover:bg-white hover:text-black transition-colors"
          >
            <BookOpen className="h-4 w-4" />
          </a>

          {/* GitHub */}
          <a
            href="#"
            target="_blank"
            rel="noreferrer"
            aria-label="Open GitHub"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 hover:bg-white hover:text-black transition-colors"
          >
            <Github className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
