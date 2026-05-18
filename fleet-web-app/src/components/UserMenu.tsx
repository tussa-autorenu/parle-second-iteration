"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";

/**
 * Placeholder account-menu items shown on the owner dashboard.
 *
 * For this MVP every item is intentionally disabled — the dropdown exists
 * to visually communicate that real account controls (account, payouts,
 * notifications, sign-out) will live here in the future, without us
 * actually wiring them up.
 */
const MENU_ITEMS = ["Account", "Payouts", "Notifications", "Sign out"];

type UserMenuProps = {
  name: string;
  avatarSrc: string;
};

/**
 * Avatar + name combo that opens a small placeholder dropdown.
 *
 * - Avatar: 48×48, circular, 2px accent-primary border (Figma node 291:476)
 * - Name: 16px desat-2, sits to the right of the avatar (10px gap)
 * - Click avatar/name → toggles dropdown
 * - Dropdown items are all disabled (cursor-not-allowed, muted text), no real handlers
 * - Click outside or press Escape → closes the dropdown
 */
export function UserMenu({ name, avatarSrc }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-outside + Escape closes the menu
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 transition-opacity duration-150 hover:opacity-80"
      >
        <span className="relative block size-12 overflow-hidden rounded-full border-2 border-accent-primary">
          <Image
            src={avatarSrc}
            alt=""
            fill
            sizes="48px"
            className="object-cover"
          />
        </span>
        <span className="text-base text-desat-2">{name}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-xl border border-desat-3 bg-white py-1 shadow-[0_10px_30px_rgba(29,6,51,0.18)]"
          >
            {MENU_ITEMS.map((item, idx) => {
              // Visually separate "Sign out" from the rest with a divider
              const showDivider = item === "Sign out" && idx > 0;
              return (
                <div key={item}>
                  {showDivider && (
                    <div className="my-1 h-px bg-desat-2" aria-hidden />
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    disabled
                    className="flex w-full cursor-not-allowed items-center px-4 py-2 text-left text-sm text-accent-dark"
                    title="Coming soon"
                  >
                    {item}
                  </button>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
