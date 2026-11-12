#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');

if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
  console.error('این ابزار باید مستقیماً در یک ترمینال تعاملی اجرا شود.');
  process.exit(1);
}

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    let value = '';
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const onData = chunk => {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\u0003') {
          cleanup();
          reject(new Error('لغو شد.'));
          return;
        }
        if (ch === '\r' || ch === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (ch === '\u007f' || ch === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (ch >= ' ' && ch !== '\u007f') value += ch;
      }
    };
    process.stdin.on('data', onData);
  });
}

(async () => {
  try {
    const first = await readHidden('رمز عبور (حداقل ۱۲ کاراکتر): ');
    const second = await readHidden('تکرار رمز عبور: ');
    if (first.length < 12) throw new Error('رمز عبور باید حداقل ۱۲ کاراکتر باشد.');
    if (first !== second) throw new Error('دو رمز واردشده یکسان نیستند.');
    const salt = crypto.randomBytes(16);
    const derived = crypto.scryptSync(first, salt, 64);
    process.stdout.write('Password hash (این مقدار را در Environment Variables قرار بده):\n');
    process.stdout.write(`scrypt$${salt.toString('hex')}$${derived.toString('hex')}\n`);
    process.stdout.write('رمز خام نمایش داده یا ذخیره نشد. Hash را محرمانه نگه دار.\n');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
  }
})();
