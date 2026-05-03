/**
 * Router centralizado con registry de páginas.
 * Resuelve dependencias circulares: las páginas importan `route` desde aquí,
 * main.js también importa desde aquí — no hay ciclo porque las páginas
 * nunca importan main.js.
 */

/** @type {Map<string, Function>} */
const _registry = new Map();

/**
 * Registrar una función de renderizado de página.
 * @param {string} id  — clave de hash, ej. "home", "sessions"
 * @param {Function} fn
 */
export function registerPage(id, fn) {
  _registry.set(id, fn);
}

/**
 * Función `route` real. Se asigna desde main.js una vez que está lista.
 * Las páginas la usan para re-navegar sin depender de main.js directamente.
 */
let _routeFn = null;

export function setRouteFn(fn) {
  _routeFn = fn;
}

export function route() {
  if (_routeFn) _routeFn();
}
