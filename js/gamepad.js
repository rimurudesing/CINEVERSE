/* ═══ cineverse/js/gamepad.js — Soporte de Mandos / Gamepad (Xbox, PlayStation, etc.) ═══ */

const BUTTON_A = 0;       // A (Xbox) / ✕ (PS) -> Seleccionar / Click
const BUTTON_B = 1;       // B (Xbox) / ○ (PS) -> Volver / Escape
const BUTTON_X = 2;       // X (Xbox) / □ (PS)
const BUTTON_Y = 3;       // Y (Xbox) / △ (PS)
const BUTTON_DPAD_UP = 12;
const BUTTON_DPAD_DOWN = 13;
const BUTTON_DPAD_LEFT = 14;
const BUTTON_DPAD_RIGHT = 15;

let isListening = false;
let rafId = null;
let lastButtonState = {};
let lastAxisTime = 0;

function dispatchNavKey(key) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true
  });
  document.dispatchEvent(event);
}

function handleGamepadInput(gamepad) {
  if (!gamepad) return;

  const now = Date.now();

  // D-Pad y botones
  gamepad.buttons.forEach((btn, index) => {
    const wasPressed = lastButtonState[index];
    const isPressed = btn.pressed || btn.value > 0.5;

    if (isPressed && !wasPressed) {
      switch (index) {
        case BUTTON_DPAD_UP:
          dispatchNavKey('ArrowUp');
          break;
        case BUTTON_DPAD_DOWN:
          dispatchNavKey('ArrowDown');
          break;
        case BUTTON_DPAD_LEFT:
          dispatchNavKey('ArrowLeft');
          break;
        case BUTTON_DPAD_RIGHT:
          dispatchNavKey('ArrowRight');
          break;
        case BUTTON_A:
          // Click en el elemento enfocado o Enter
          if (document.activeElement && typeof document.activeElement.click === 'function') {
            document.activeElement.click();
          } else {
            dispatchNavKey('Enter');
          }
          break;
        case BUTTON_B:
          // Volver atrás
          if (window.history.length > 1) {
            window.history.back();
          } else {
            dispatchNavKey('Escape');
          }
          break;
      }
    }
    lastButtonState[index] = isPressed;
  });

  // Stick izquierdo como D-Pad analógico con deadzone y throttle
  if (now - lastAxisTime > 180) {
    const axisX = gamepad.axes[0] || 0;
    const axisY = gamepad.axes[1] || 0;
    const deadzone = 0.45;

    if (axisY < -deadzone) {
      dispatchNavKey('ArrowUp');
      lastAxisTime = now;
    } else if (axisY > deadzone) {
      dispatchNavKey('ArrowDown');
      lastAxisTime = now;
    } else if (axisX < -deadzone) {
      dispatchNavKey('ArrowLeft');
      lastAxisTime = now;
    } else if (axisX > deadzone) {
      dispatchNavKey('ArrowRight');
      lastAxisTime = now;
    }
  }
}

function loop() {
  if (!isListening) return;

  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < gamepads.length; i++) {
    if (gamepads[i]) {
      handleGamepadInput(gamepads[i]);
      break; // Procesar el primer mando activo
    }
  }

  rafId = requestAnimationFrame(loop);
}

export function initGamepad() {
  if (typeof window === 'undefined' || !('getGamepads' in navigator)) return;

  window.addEventListener('gamepadconnected', (e) => {
    console.log('[CineVerse] Mando conectado:', e.gamepad.id);
    if (!isListening) {
      isListening = true;
      loop();
    }
  });

  window.addEventListener('gamepaddisconnected', () => {
    const remaining = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    if (remaining.length === 0) {
      isListening = false;
      if (rafId) cancelAnimationFrame(rafId);
    }
  });

  // Si ya hay un mando conectado al iniciar
  const initial = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
  if (initial.length > 0 && !isListening) {
    isListening = true;
    loop();
  }
}
