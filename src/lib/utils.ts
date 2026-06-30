import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines Tailwind class names intelligently:
 *   - `clsx` joins conditionals into a single space-delimited string
 *   - `twMerge` resolves Tailwind class conflicts (later `px-4` wins over earlier `px-2`)
 *
 * Use this any time you compose classNames with a conditional or a prop, e.g.:
 *
 *   <Pressable className={cn("rounded-2xl px-4 py-3", pressed && "opacity-80")} />
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
