# SQLCipher Migration — At-Rest Encryption for the Live DB

## Why

Liminal is a local-only journaling app. Backups (`.liminal` files) are already AES-256-GCM encrypted, but the live database at `%APPDATA%/Liminal/liminal.db` is plaintext SQLite. Anyone with file access to a logged-in machine can open it in DB Browser and read every entry.

BitLocker/FileVault protect the drive at rest (laptop off, drive pulled, stolen device). They do NOT protect against someone accessing an unlocked, logged-in machine — or malware running under the user account. For a private journal, that gap matters: the knowledge that entries are protected changes how honestly one writes.

This plan closes that gap with app-level encryption on the live DB, matching what Day One (E2EE opt-in), Standard Notes (E2EE default), and Apple Journal (on-device + Face ID) do.

## Threat model

**Protects against:**
- Someone on your unlocked, logged-in computer opening the DB file directly
- Malware running under your user account reading the DB file
- DB Browser / sqlite CLI inspection without the password
- Cloud sync services that snapshot `%APPDATA%`

**Does NOT protect against:**
- A keylogger that captures your password as you type it
- Someone watching over your shoulder as you unlock
- Memory scraping while the app is running (key lives in RAM during a session)
- Forgotten password with lost recovery key → data is permanently gone (by design)

## Approach

### 1. Swap the SQLite driver

Replace `better-sqlite3` with [`better-sqlite3-multiple-ciphers`](https://github.com/m4heshd/better-sqlite3-multiple-ciphers). Drop-in API compatibility — same `db.prepare(...)`, `db.pragma(...)`, same transaction semantics.

- Update `backend/package.json` dependency
- `npm install` + electron-rebuild against the app's Electron ABI (we've hit this flow twice this session with `better-sqlite3`; same dance)
- No changes needed in routes, queries, or schema

### 2. Key derivation

User enters a password → derive a key via **PBKDF2 or scrypt** (SQLCipher's built-in KDF handles this). Never store the password or derived key on disk.

- Iteration count: SQLCipher 4 default (256,000 PBKDF2-HMAC-SHA512) is fine
- Salt: SQLCipher generates one per database
- Password strength: require minimum 8 chars at setup; show a strength indicator but don't block

### 3. Recovery key (not security questions)

At first setup, generate a **256-bit random recovery key**, encoded as a human-readable string (e.g. `7K3M-9QXT-P4RW-L8ZN-...`, 20 chars in groups of 4).

- Stored as a second key-slot: the master DB key is wrapped twice — once by the password-derived key, once by the recovery key. Either unwraps it.
- Recovery key is shown to the user **once** during setup.
- Require the user to type it back (confirms they actually saved it) before proceeding.
- Offer "Save as PDF" and "Copy to clipboard" buttons.
- **No security questions.** (See `docs/why-no-security-questions.md` — or inline below.) Local answers-as-password are as guessable as the weakest answer and equally exposed to anyone who has the DB file.

### 4. Unlock flow

**First launch (new install):**
1. Welcome screen → "Set a password to protect your journal"
2. Password + confirm
3. Generate and display recovery key
4. Confirm recovery key saved (type-back)
5. Initialize encrypted DB

**First launch (existing install — migration):**
1. Detect existing unencrypted `liminal.db`
2. Prompt: "Encrypt your journal with a password" (explain why)
3. Same setup flow as above
4. Migrate: `ATTACH DATABASE 'liminal.db.new' AS encrypted KEY '...'` → `SELECT sqlcipher_export('encrypted')` → detach → replace file
5. Keep `liminal.db.backup-pre-encryption` for 7 days as safety net (auto-delete after)

**Every launch after:**
1. Password prompt (modal, blocks app)
2. "Forgot password?" link → recovery key prompt
3. On correct entry, DB opens, app proceeds normally
4. Optional: "Remember for this session" (already the default — key lives in memory until the app quits)

### 5. Backend wiring

The backend process needs the key to open the DB. Currently the backend starts on app launch and opens the DB immediately. New flow:

1. Backend starts, waits for key via IPC before opening the DB
2. Electron main process shows the unlock window (React component)
3. User enters password → main hashes/derives via SQLCipher's pragma → passes derived key to backend over IPC
4. Backend opens DB with `db.pragma(\`key = "x'<hex>'"\`)` and responds "ready"
5. Main loads the main window only after DB is ready

Key never touches disk. Key is cleared from main-process memory as soon as it's handed to the backend. Backend holds it for the session (required — every query goes through the keyed connection).

### 6. Change password

Settings → Security → Change password:
1. Verify current password
2. Enter new password + confirm
3. `db.pragma(\`rekey = '<new>'\`)` — SQLCipher re-encrypts the whole DB in-place
4. Regenerate recovery key (old one now invalid)
5. Show new recovery key, confirm saved

### 7. Backup compatibility

Existing `.liminal` backup system reads entries via the DB connection — it doesn't touch the file directly. So once the DB is open and keyed, backups work as before. The backup password (separate from the DB password) still encrypts the `.liminal` file on disk.

Recommendation in onboarding: use the same password for DB and backups, or at minimum store both in the same password manager.

## Files to modify

| File | Change |
|------|--------|
| `backend/package.json` | Replace `better-sqlite3` with `better-sqlite3-multiple-ciphers` |
| `backend/database.js` | Add `pragma('key = ...')` right after DB open; accept key via env/IPC |
| `backend/server.js` | Wait for key-ready signal from main before opening DB |
| `electron/main.js` (or equivalent) | Show unlock window before main window; IPC key to backend |
| `electron/preload.js` | Expose unlock IPC channel to renderer |
| `frontend/src/pages/UnlockPage.jsx` *(new)* | Password prompt, forgot-password → recovery key flow |
| `frontend/src/pages/FirstRunSetupPage.jsx` *(new)* | Password setup, recovery key generation + confirmation |
| `frontend/src/pages/ChangePasswordPage.jsx` *(new)* | Settings flow for password/recovery-key rotation |
| `backend/services/migration-to-encrypted.js` *(new)* | One-time migration: existing plaintext DB → encrypted, with safety backup |
| `docs/sqlcipher-plan.md` | This document |

## Verification / test plan

1. **Fresh install**: setup flow runs; password + recovery key saved; journal works normally
2. **Relaunch**: unlock prompt appears; correct password opens DB; wrong password rejected
3. **Recovery key path**: "Forgot password" → type recovery key → set new password → relaunch with new password works
4. **Migration from unencrypted**: install over existing `liminal.db`; prompt triggers; migration succeeds; entries intact; `.backup-pre-encryption` file exists; restart with password works
5. **Change password**: rotate password; old password rejected; new one works; new recovery key works; old recovery key rejected
6. **DB Browser test**: try to open `liminal.db` with DB Browser for SQLite (no SQLCipher plugin). Should show "file is encrypted or is not a database." That's the proof it's working.
7. **Backup round-trip**: create a `.liminal` backup while encrypted DB is open; wipe DB; restore from backup; entries appear
8. **Performance**: benchmark entry list + search — expect 5–15% slower; should be imperceptible at journal scale

## Risks

- **Forgotten password + lost recovery key = permanent data loss.** Make this impossible to miss in the onboarding copy. Require the user to check a box acknowledging it.
- **Electron native rebuild.** Same issue we've hit with `better-sqlite3`. Solvable, but budget time for it.
- **Migration edge cases.** What if the user has a corrupted DB, or the migration fails mid-flight? Keep the pre-migration backup until migration verifies with a full read. Never delete the old file until a successful open of the new one is confirmed.
- **External tooling loss.** You'll no longer be able to open the DB with generic SQLite tools for debugging. Install a SQLCipher-aware tool (DB Browser for SQLite — SQLCipher edition) on your dev machine.
- **IPC key transport.** The key passes from main to backend once per session. Use a named pipe or stdin (not argv, which leaks to `ps`). Never log the key.

## Effort estimate

- Core encryption + DB wiring: ~4 hours
- Password/recovery-key UI: ~4 hours
- Migration flow + safety backup: ~2 hours
- Testing all paths: ~2 hours
- **Total: 1.5–2 focused days**

## Not doing (and why)

- **Security questions**: local answers-as-password weaken the system to the strength of the weakest answer, and the check logic + questions sit in the same file as the DB. Industry consensus: don't.
- **Column-level encryption only**: leaks titles, dates, tags. Breaks FTS search. All the UX pain of full encryption with half the protection.
- **Biometric unlock (Windows Hello / Touch ID)**: nice-to-have, future work. Requires storing a second key slot unlocked by the OS credential provider. Defer until v2.
- **Cloud recovery (email a recovery link)**: breaks the local-only promise. Defer forever.

## Prerequisites

- BitLocker / FileVault enabled (defense in depth — protects the key material in memory dumps / hibernation files)
- A current `.liminal` backup before running the migration
- Clear hour or two with no interruptions when doing the migration on the real journal
