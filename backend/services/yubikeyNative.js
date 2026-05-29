// services/yubikeyNative.js
//
// Bridges the Node backend to the bundled PyInstaller helper binary that
// talks CTAP2 directly to a connected YubiKey over USB HID. This path
// exists because Electron's Chromium on macOS does not ship Chrome's
// FIDO2 PIN-entry dialog, so `navigator.credentials.create()` /
// `.get()` with the `prf`/hmac-secret extension reliably fails with
// NotAllowedError on any PIN-protected key. The Windows build keeps using
// browser WebAuthn since Windows Hello provides the PIN UI for free.
//
// The helper is a small Python program (`yubikey_helper.py`) bundled via
// PyInstaller into `dist/yubikey_helper/yubikey_helper`, copied into the
// .app via electron-builder's extraResources, and run on demand as a
// child_process for each enroll / assert. It exits after one command,
// emitting a single line of JSON on stdout.
//
// Wire-format:
//   - Subcommands: is-present | enroll [--pin <pin>] | assert --credential-id <b64> --salt <b64> [--pin <pin>]
//   - stdout: one JSON object. On success, fields depend on subcommand.
//     On failure, an `error` field; PIN-required is signalled with
//     `error_code: "YUBIKEY_PIN_REQUIRED"` so callers can prompt the user
//     and retry with --pin.

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PIN_REQUIRED_CODE = 'YUBIKEY_PIN_REQUIRED';

/**
 * Locate the helper binary. The Electron main process sets
 * `LIMINAL_YUBIKEY_HELPER` to the absolute path inside the .app's Resources
 * dir when running packaged. In dev (`npm start`), we fall back to running
 * the Python script directly via the .venv-yubikey interpreter so the
 * developer doesn't have to PyInstall on every change.
 *
 * Returns `{ cmd, args }` ready to pass to child_process.spawn, or null if
 * we can't locate either form.
 */
function resolveHelper() {
  const envPath = process.env.LIMINAL_YUBIKEY_HELPER;
  if (envPath && fs.existsSync(envPath)) {
    return { cmd: envPath, args: [] };
  }
  // Dev fallback — repo layout.
  const repoRoot = path.resolve(__dirname, '..', '..');
  const devVenvPython = path.join(repoRoot, '.venv-yubikey', 'bin', 'python');
  const devScript = path.join(repoRoot, 'yubikey_helper.py');
  if (fs.existsSync(devVenvPython) && fs.existsSync(devScript)) {
    return { cmd: devVenvPython, args: [devScript] };
  }
  return null;
}

/**
 * Spawn the helper with the given subcommand args. Resolves with the parsed
 * JSON; rejects on spawn failure or invalid JSON output. CTAP-level errors
 * (no key, PIN required, etc.) are returned as JSON with an `error` field
 * — the resolver returns that object verbatim, callers inspect it.
 */
function run(subcommand, args = [], { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const helper = resolveHelper();
    if (!helper) {
      return reject(new Error(
        'YubiKey helper binary not found. On macOS, this means the bundled ' +
        'yubikey_helper is missing from the .app — try reinstalling Liminal.'
      ));
    }

    const proc = spawn(helper.cmd, [...helper.args, subcommand, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill('SIGTERM'); } catch {}
      reject(new Error(
        'YubiKey helper timed out. The key may be unplugged or stuck — ' +
        'try unplugging and replugging it.'
      ));
    }, timeoutMs);

    proc.stdout.on('data', (b) => { stdout += b.toString('utf8'); });
    proc.stderr.on('data', (b) => { stderr += b.toString('utf8'); });
    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Helper always prints one JSON line, even on non-zero exit.
      const line = stdout.trim().split('\n').filter(Boolean).pop() || '';
      if (!line) {
        return reject(new Error(
          `YubiKey helper exited with code ${code} and no output. stderr: ${stderr.trim()}`
        ));
      }
      try {
        resolve(JSON.parse(line));
      } catch {
        reject(new Error(
          `YubiKey helper returned non-JSON output: ${line.slice(0, 200)}`
        ));
      }
    });
  });
}

// ── High-level commands ─────────────────────────────────────────────────────
async function isPresent() {
  try {
    const r = await run('is-present', [], { timeoutMs: 5_000 });
    return !!r.present;
  } catch {
    return false;
  }
}

/** Enroll a new credential. Returns the result dict as-is so the caller can
 * inspect error_code === YUBIKEY_PIN_REQUIRED.
 *
 * On success: { credential_id, prf_salt, prf_output } — all base64.
 * On PIN required: { error, error_code: 'YUBIKEY_PIN_REQUIRED' }
 * On other failures: { error: <message> }
 */
async function enroll({ pin } = {}) {
  const args = [];
  if (pin) args.push('--pin', pin);
  return run('enroll', args);
}

/** Get an hmac-secret output for an existing credential. */
async function assert({ credentialId, salt, pin } = {}) {
  if (!credentialId || !salt) {
    throw new Error('credentialId and salt required');
  }
  const args = ['--credential-id', credentialId, '--salt', salt];
  if (pin) args.push('--pin', pin);
  return run('assert', args);
}

module.exports = {
  PIN_REQUIRED_CODE,
  isPresent,
  enroll,
  assert,
};
