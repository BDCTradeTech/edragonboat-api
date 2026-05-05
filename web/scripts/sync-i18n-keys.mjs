#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const localesDir = './src/locales';
const localeFiles = fs.readdirSync(localesDir).filter(f => f.endsWith('.json'));

// Leer archivo base (es.json como fuente de keys)
const baseLocale = JSON.parse(fs.readFileSync(path.join(localesDir, 'es.json'), 'utf8'));

function getNestedValue(obj, keyPath) {
  return keyPath.split('.').reduce((current, key) => current?.[key], obj);
}

function setNestedValue(obj, keyPath, value) {
  const keys = keyPath.split('.');
  const lastKey = keys.pop();
  let current = obj;
  for (const key of keys) {
    if (!current[key]) current[key] = {};
    current = current[key];
  }
  current[lastKey] = value;
}

function getAllKeys(obj, prefix = '') {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...getAllKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// Obtener todas las claves de es.json
const allKeys = getAllKeys(baseLocale);
console.log(`Found ${allKeys.length} keys in base locale (es.json)`);

// Para cada idioma, agregar claves faltantes
for (const file of localeFiles) {
  if (file === 'es.json') continue; // Skip base
  const filePath = path.join(localesDir, file);
  let locale = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  let addedCount = 0;
  for (const keyPath of allKeys) {
    const baseValue = getNestedValue(baseLocale, keyPath);
    const currentValue = getNestedValue(locale, keyPath);

    if (currentValue === undefined) {
      // Agregar la clave con el valor de la base (en español)
      setNestedValue(locale, keyPath, baseValue);
      addedCount++;
    }
  }

  if (addedCount > 0) {
    fs.writeFileSync(filePath, JSON.stringify(locale, null, 2) + '\n', 'utf8');
    console.log(`[${file}] Added ${addedCount} missing keys`);
  } else {
    console.log(`[${file}] No missing keys`);
  }
}

console.log('Done syncing i18n keys!');
