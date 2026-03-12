import { useEffect, type RefObject } from "react";

/**
 * Calls `onClose` when the user clicks outside of the referenced element(s)
 * or presses Escape. Only active when `active` is true.
 */
export function useOutsideClick(
  refs: RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[],
  onClose: () => void,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    const refArray = Array.isArray(refs) ? refs : [refs];

    const handleClick = (e: MouseEvent) => {
      const clickedInside = refArray.some(
        (ref) => ref.current && ref.current.contains(e.target as Node),
      );
      if (!clickedInside) onClose();
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [refs, onClose, active]);
}
