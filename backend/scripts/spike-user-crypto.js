// Sanity test for userCrypto + rowCrypto. Run with plain node:
//   node backend/scripts/spike-user-crypto.js
const uc = require('../services/userCrypto');
const rc = require('../services/rowCrypto');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('PASS', msg); } else { fail++; console.log('FAIL', msg); } };

// 1. Create key slots
const { userKey, recoveryKey, fields } = uc.createKeySlots('correct horse battery');
ok(userKey.length === 32, 'userKey is 32 bytes');
ok(/^[0-9A-F]{4}(-[0-9A-F]{4}){7}$/.test(recoveryKey), `recovery key format: ${recoveryKey}`);

// 2. Unlock with password
const unlocked1 = uc.unlockWithPassword('correct horse battery', fields);
ok(unlocked1 && unlocked1.equals(userKey), 'password unlocks user key');

// 3. Wrong password rejected
const unlocked2 = uc.unlockWithPassword('wrong', fields);
ok(unlocked2 === null, 'wrong password rejected');

// 4. Unlock with recovery key (various formats)
ok(uc.unlockWithRecovery(recoveryKey, fields)?.equals(userKey), 'recovery key (canonical) unlocks');
ok(uc.unlockWithRecovery(recoveryKey.toLowerCase(), fields)?.equals(userKey), 'recovery key (lowercase) unlocks');
ok(uc.unlockWithRecovery(recoveryKey.replace(/-/g, ''), fields)?.equals(userKey), 'recovery key (no dashes) unlocks');
ok(uc.unlockWithRecovery('bad', fields) === null, 'malformed recovery rejected');

// 5. View current recovery key via password
const viewed = uc.decryptRecoveryKey('correct horse battery', fields);
ok(viewed === recoveryKey, 'view recovery key with password');

// 6. Rotate password
const newPwFields = uc.rewrapPassword(userKey, 'new pw', recoveryKey);
const merged = { ...fields, ...newPwFields };
ok(uc.unlockWithPassword('new pw', merged)?.equals(userKey), 'new password unlocks after rotation');
ok(uc.unlockWithPassword('correct horse battery', merged) === null, 'old password rejected after rotation');
ok(uc.unlockWithRecovery(recoveryKey, merged)?.equals(userKey), 'recovery key still works after password rotation');
ok(uc.decryptRecoveryKey('new pw', merged) === recoveryKey, 'recovery key viewable under new password');

// 7. Rotate recovery key
const { recoveryKey: newRk, fields: rotFields } = uc.rotateRecoveryKey(userKey, 'new pw', newPwFields.password_salt);
const merged2 = { ...merged, ...rotFields };
ok(newRk !== recoveryKey, 'new recovery key differs');
ok(uc.unlockWithRecovery(newRk, merged2)?.equals(userKey), 'new recovery key unlocks');
ok(uc.unlockWithRecovery(recoveryKey, merged2) === null, 'old recovery key rejected');
ok(uc.decryptRecoveryKey('new pw', merged2) === newRk, 'settings view shows new recovery key');

// 8. rowCrypto roundtrip
rc.setUserKey(42, userKey);
const plain = 'today I felt something I cannot name — it sat like a stone.';
const enc = rc.encryptField(42, plain);
ok(enc.startsWith('lenc:v1:'), 'encryptField emits sentinel');
ok(rc.decryptField(42, enc) === plain, 'decryptField roundtrips');
ok(rc.decryptField(42, 'legacy plaintext row') === 'legacy plaintext row', 'legacy rows pass through');
ok(rc.encryptField(42, '') === '', 'empty string stays empty');
ok(rc.encryptField(42, null) === null, 'null stays null');

// 9. Wrong user cannot decrypt
rc.setUserKey(43, require('crypto').randomBytes(32));
let threw = false;
try { rc.decryptField(43, enc); } catch { threw = true; }
ok(threw, 'other user key cannot decrypt');

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
