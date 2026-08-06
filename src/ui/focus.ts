import type { MouseEvent } from 'react';

/**
 * Release focus after a mouse click, so the board keeps the keyboard.
 *
 * Clicking a button leaves it focused, which would mean Enter re-fires that button
 * instead of submitting the guess. Only mouse activation fires mouseup, so a keyboard
 * user who tabbed to the button keeps focus and its normal Enter behaviour.
 */
export function releaseFocus(event: MouseEvent<HTMLElement>): void {
  event.currentTarget.blur();
}
