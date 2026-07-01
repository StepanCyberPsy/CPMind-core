import type { RefObject } from 'react';
import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
} from 'react';

export interface PopoverHandlers {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: RefObject<HTMLButtonElement>;
  panelRef: RefObject<HTMLDivElement>;
  coords: { top: number; left: number } | null;
}

const VIEWPORT_MARGIN_PX = 16;

export function usePopover(): PopoverHandlers {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const triggerRect = trigger.getBoundingClientRect();
    const panelWidth = panel.offsetWidth;
    const overflowsRight = triggerRect.left + panelWidth > window.innerWidth - VIEWPORT_MARGIN_PX;

    setCoords({
      top: triggerRect.bottom + 4,
      left: overflowsRight ? triggerRect.right - panelWidth : triggerRect.left,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent): void {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function handleScroll(event: Event): void {
      const target = event.target;

      if (target instanceof Node && panelRef.current?.contains(target)) return;

      setOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open]);

  return { open, setOpen, triggerRef, panelRef, coords };
}