import React from 'react';

type Variant = 'primary' | 'ghost';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** Shared button styles. Two variants only — see the design rationale in
 *  CLAUDE.md (Design System › Buttons):
 *
 *  - `primary` — filled brand red, white text. Every positive action: Save,
 *                Create, Convert, Track, Re-review. There can be more than one
 *                per page; consistency over hierarchy was the explicit choice
 *                on 2026-05-27. If a page ever needs to suppress a sibling
 *                positive action, demote it to ghost rather than reintroducing
 *                an outlined-red variant.
 *  - `ghost`   — muted gray text, red on hover. Cancel, Archive, Remove,
 *                dismissive / destructive actions. Distinguishes "back out"
 *                from "commit" when both buttons sit side-by-side. */
const VARIANTS: Record<Variant, string> = {
  primary:
    'rounded-lg bg-[#ED202B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#9B0E18] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed',
  ghost:
    'rounded-lg px-3 py-2 text-sm font-medium text-[#7A756E] transition hover:text-[#ED202B] disabled:opacity-50 disabled:cursor-not-allowed',
};

export default function Button({
  variant = 'primary',
  type = 'button',
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 ${VARIANTS[variant]} ${className ?? ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}
