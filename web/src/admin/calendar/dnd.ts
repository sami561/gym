import { useLayoutEffect, useRef, type RefObject } from 'react';
import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { nextKeyboardPosition } from './slots';

/**
 * Space picks a session up (Enter keeps opening its details), arrows move it, Space or Enter drops it,
 * Escape or Tab cancels.
 */
export const CALENDAR_KEYS = { start: ['Space'], cancel: ['Escape', 'Tab'], end: ['Space', 'Enter'] };

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/** Pixels moved by one arrow press on each axis; an axis without a step jumps to the next drop target. */
export type KeyboardSteps = (activeId: string) => { x?: number; y?: number; lockX?: boolean; lockY?: boolean };

/**
 * Mouse: a drag starts after 5 px, so a plain click still opens the editor. Touch (reception tablet):
 * press and hold 220 ms, so swiping still scrolls the page. Keyboard: see CALENDAR_KEYS.
 */
export function useCalendarSensors(steps: KeyboardSteps) {
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const coordinateGetter: KeyboardCoordinateGetter = (event, { active, context, currentCoordinates }) => {
    if (!ARROWS.includes(event.code)) return undefined;
    const box = context.collisionRect;
    const { lockX, lockY, ...axisSteps } = stepsRef.current(String(active));
    const horizontal = event.code === 'ArrowLeft' || event.code === 'ArrowRight';
    // Swallow the key (no page scroll) when the move is not possible.
    if (!box || (horizontal && lockX) || (!horizontal && lockY)) return currentCoordinates;
    return nextKeyboardPosition(event.code, box, [...context.droppableRects.values()], axisSteps) ?? currentCoordinates;
  };
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { keyboardCodes: CALENDAR_KEYS, coordinateGetter }),
  );
}

/** The drop target under the finger or the mouse; for the keyboard, the one nearest to the moved item. */
export const pointerOrClosest: CollisionDetection = (args) => (args.pointerCoordinates ? pointerWithin(args) : closestCenter(args));

/** True when the drag was started from the keyboard (Space), whose user needs the focus kept. */
export function fromKeyboard(event: { activatorEvent: Event | null }): boolean {
  return typeof KeyboardEvent !== 'undefined' && event.activatorEvent instanceof KeyboardEvent;
}

/**
 * After a keyboard drop to another cell or row, the item's button is created again under its new parent
 * (and once more if the move is refused and rolled back), so the focus would fall to <body>. While
 * `refocus` is on, each new button takes the focus; once the move is settled (`pending` off), `done`
 * clears the request.
 */
export function useRefocusAfterDrop(node: RefObject<HTMLElement | null>, refocus: boolean, pending: boolean, done: () => void) {
  useLayoutEffect(() => {
    if (!refocus) return;
    node.current?.focus();
    if (!pending) done();
  }, [node, refocus, pending, done]);
}

/** Draggable items: no text selection or iOS callout on a long press, scrolling still allowed. */
export const DRAGGABLE_CLASS = 'touch-manipulation select-none [-webkit-touch-callout:none]';
