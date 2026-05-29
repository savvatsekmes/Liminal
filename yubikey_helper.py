#!/usr/bin/env python3
"""yubikey_helper.py — native CTAP2 helper for Liminal on macOS.

Why this exists:
  Electron's Chromium does not include Chrome's WebAuthn PIN-entry UI
  (`//chrome/browser/webauthn/`), so `navigator.credentials.create()` /
  `.get()` with the `prf` (hmac-secret) extension throws NotAllowedError on
  macOS whenever a FIDO2 PIN is required — which it effectively is for
  hmac-secret operations even when the request says
  `userVerification: 'discouraged'`. The Liminal Node backend therefore
  shells out to this helper to talk CTAP2 directly to the YubiKey over USB
  HID, bypassing the browser stack entirely.

  The Windows build keeps using browser WebAuthn because Windows Hello
  provides its own OS-level PIN UI.

Approach:
  Mirrors what Signet's Rust `yubikey.rs` does. Tries the "no-UV"
  (`pinUvAuthParam` omitted) path first — this relies on the YubiKey's
  default `makeCredUvNotRqd = true` flag, which means hmac-secret can be
  registered and asserted without ever performing user verification, even
  if the device has a PIN set. Only if the device truly refuses the no-UV
  path do we surface the YUBIKEY_PIN_REQUIRED sentinel back to the
  frontend so it can prompt for a PIN and retry.

Subcommands (called from Node backend via child_process):
  is-present                                   — does any FIDO2 key exist?
  enroll [--pin <pin>]                         — register new credential,
                                                  return cred_id + salt +
                                                  hmac-secret output
  assert --credential-id <b64> --salt <b64> [--pin <pin>]
                                               — re-derive hmac-secret
                                                  output for stored cred

Output: a single line of JSON on stdout. Errors are JSON objects with an
`error` field. The sentinel string `YUBIKEY_PIN_REQUIRED` is set as the
`error_code` field when the device demands PIN.

The challenge value used in makeCredential/getAssertion is a fresh random
32 bytes — we do not verify attestation server-side (same as the browser
WebAuthn path), so the challenge is anti-replay hygiene only.
"""

import argparse
import base64
import json
import logging
import os
import sys
from typing import Optional

# Suppress python-fido2's INFO/WARNING noise so stdout is clean JSON.
logging.basicConfig(level=logging.ERROR)
logging.getLogger("fido2").setLevel(logging.ERROR)

try:
    from fido2.hid import CtapHidDevice
    from fido2.ctap import CtapError
    from fido2.ctap2 import Ctap2
    from fido2.ctap2.extensions import HmacSecretExtension
    from fido2.ctap2.pin import ClientPin
except ImportError as e:
    print(json.dumps({"error": f"fido2 library not available: {e}"}))
    sys.exit(1)


# Stable across enrollments. WebAuthn ties credentials to RP ID; if this ever
# changes, existing enrolled credentials become unfindable.
RP_ID = "localhost"
RP_NAME = "Liminal"

# Sentinel surfaced when the device refuses the no-UV path and we need a PIN
# from the user. Recognised by the frontend / backend to show a PIN field.
ERR_PIN_REQUIRED = "YUBIKEY_PIN_REQUIRED"


# ── Base64 helpers ──────────────────────────────────────────────────────────
def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _b64d(s: str) -> bytes:
    return base64.b64decode(s)


# ── Device discovery ────────────────────────────────────────────────────────
def find_device() -> Optional[CtapHidDevice]:
    """First connected FIDO HID device, or None.

    We don't disambiguate when multiple keys are plugged in — the common
    case is one, and whichever responds to the touch matches user
    expectation. Mirrors Signet's `first_device()`.
    """
    for dev in CtapHidDevice.list_devices():
        return dev
    return None


def _err_out(msg: str, code: Optional[str] = None) -> int:
    payload = {"error": msg}
    if code:
        payload["error_code"] = code
    print(json.dumps(payload))
    return 1


def _is_pin_required(e: CtapError) -> bool:
    """True when the CTAP status code indicates the device wants UV / PIN.

    PUAT_REQUIRED (0x36) is the canonical "pinUvAuthToken required" code in
    CTAP2.1 — what a PIN-protected YubiKey returns when we attempt
    hmac-secret on the no-UV path and policy demands UV.

    OPERATION_DENIED (0x27) is what some YubiKey firmware returns instead
    when the device refuses the hmac-secret extension without UV. Same
    root cause (device demands UV), different status code.

    PIN_AUTH_INVALID (0x33) is a wrong-PIN error, NOT a needs-PIN error —
    don't conflate them.
    """
    return e.code in (
        CtapError.ERR.PUAT_REQUIRED,
        CtapError.ERR.OPERATION_DENIED,
    )


def _map_ctap_error(context: str, e: CtapError) -> str:
    """Translate raw CTAP status codes into user-actionable messages.
    Mirrors Signet's map_ctap_error.
    """
    code = e.code
    if code == CtapError.ERR.PIN_INVALID:
        return ("Wrong PIN. Try again — note that 8 wrong PIN attempts in total "
                "will permanently lock the FIDO2 applet on your YubiKey.")
    if code == CtapError.ERR.PIN_AUTH_BLOCKED:
        return ("Too many wrong PIN attempts in this session. Unplug your YubiKey, "
                "plug it back in, and try again.")
    if code == CtapError.ERR.PIN_BLOCKED:
        return ("Your YubiKey is locked from too many wrong PIN attempts. The FIDO2 "
                "applet must be factory-reset (this will erase every credential on "
                "the key for every service).")
    return f"{context}: {e}"


# ── PIN handling ────────────────────────────────────────────────────────────
def _build_pin_uv_param(ctap2: Ctap2, pin: str, permissions: int,
                       client_data_hash: bytes,
                       rp_id: Optional[str] = None):
    """Negotiate a pinUvAuthToken and compute the pinUvAuthParam HMAC over the
    client data hash. CTAP2's Ctap2.make_credential/get_assertion expect the
    HMAC, not the raw token — passing the token directly results in
    PIN_AUTH_INVALID (0x33). Mirrors what Fido2Client does internally.

    Returns (protocol_version, pin_uv_param_bytes).
    """
    client_pin = ClientPin(ctap2)
    token = client_pin.get_pin_token(
        pin, permissions=permissions, permissions_rpid=rp_id,
    )
    param = client_pin.protocol.authenticate(token, client_data_hash)
    return client_pin.protocol.VERSION, param


# ── Subcommands ─────────────────────────────────────────────────────────────
def cmd_is_present(_args) -> int:
    dev = find_device()
    if dev is None:
        print(json.dumps({"present": False}))
        return 0
    try:
        ctap2 = Ctap2(dev)
        has_hmac = "hmac-secret" in (ctap2.info.extensions or [])
        print(json.dumps({"present": True, "hmac_secret_supported": has_hmac}))
    except Exception as e:
        # Device present but we can't talk to it — still "present" for UI purposes.
        print(json.dumps({"present": True, "hmac_secret_supported": False, "warning": str(e)}))
    return 0


def cmd_enroll(args) -> int:
    dev = find_device()
    if dev is None:
        return _err_out("No security key detected. Plug your YubiKey into a USB "
                        "port and try again.")

    try:
        ctap2 = Ctap2(dev)
    except Exception as e:
        return _err_out(f"Cannot open security key: {e}")

    if "hmac-secret" not in (ctap2.info.extensions or []):
        return _err_out("Your security key does not support the hmac-secret "
                        "extension. Liminal needs a YubiKey 5 series or later.")

    # Random per-enrollment salt. Stored alongside the credential ID on the
    # users row so future assertions can reproduce the same hmac output.
    hmac_salt = os.urandom(32)

    challenge = os.urandom(32)
    user_id = os.urandom(32)  # Opaque, not PII
    user = {"id": user_id, "name": "liminal-user", "displayName": "Liminal user"}
    rp = {"id": RP_ID, "name": RP_NAME}
    pub_key_params = [
        {"type": "public-key", "alg": -7},   # ES256
        {"type": "public-key", "alg": -257}, # RS256
    ]
    extensions = {"hmac-secret": True}

    # Attempt 1: no-UV. Out-of-the-box keys take this path; PIN-set YubiKeys
    # also accept it as long as `makeCredUvNotRqd` is true (YubiKey default).
    # Picking the right mode at enrollment matters because CTAP2 keeps two
    # separate CredRandom secrets per credential — one for UV, one for no-UV
    # — and the hmac outputs differ. Assert later must match this mode.
    try:
        att = ctap2.make_credential(
            challenge, rp, user, pub_key_params,
            extensions=extensions,
            # No `options={"uv": False}` here — explicitly setting uv=false
            # tripped OPERATION_DENIED on the test YubiKey, while leaving the
            # field unset returns the cleaner PUAT_REQUIRED that we catch
            # below and surface as YUBIKEY_PIN_REQUIRED.
        )
    except CtapError as e:
        if not _is_pin_required(e):
            return _err_out(_map_ctap_error("Enrollment failed", e))
        if not args.pin:
            return _err_out("PIN required", code=ERR_PIN_REQUIRED)
        # Retry with PIN-derived pinUvAuthParam.
        try:
            pin_protocol_ver, pin_uv_param = _build_pin_uv_param(
                ctap2, args.pin,
                permissions=ClientPin.PERMISSION.MAKE_CREDENTIAL,
                client_data_hash=challenge,
                rp_id=RP_ID,
            )
            att = ctap2.make_credential(
                challenge, rp, user, pub_key_params,
                extensions=extensions,
                pin_uv_protocol=pin_protocol_ver,
                pin_uv_param=pin_uv_param,
            )
        except CtapError as e2:
            return _err_out(_map_ctap_error("Enrollment failed", e2))
    except Exception as e:
        return _err_out(f"Enrollment failed: {e}")

    credential_id = att.auth_data.credential_data.credential_id

    # Step 2: immediately assert to extract the hmac-secret output for our salt.
    # YubiKey will flash for a second touch. Most users batch the two touches.
    try:
        prf_output = _assert_hmac(ctap2, credential_id, hmac_salt, args.pin)
    except CtapError as e:
        return _err_out(_map_ctap_error("Could not extract hmac-secret", e))
    except Exception as e:
        return _err_out(f"Could not extract hmac-secret: {e}")

    print(json.dumps({
        "credential_id": _b64(credential_id),
        "prf_salt": _b64(hmac_salt),
        "prf_output": _b64(prf_output),
    }))
    return 0


def cmd_assert(args) -> int:
    dev = find_device()
    if dev is None:
        return _err_out("No security key detected. Plug your YubiKey into a USB "
                        "port and try again.")
    try:
        ctap2 = Ctap2(dev)
    except Exception as e:
        return _err_out(f"Cannot open security key: {e}")

    credential_id = _b64d(args.credential_id)
    salt = _b64d(args.salt)
    if len(salt) != 32:
        return _err_out("Invalid salt length (expected 32 bytes base64)")

    try:
        prf_output = _assert_hmac(ctap2, credential_id, salt, args.pin)
    except CtapError as e:
        if _is_pin_required(e) and not args.pin:
            return _err_out("PIN required", code=ERR_PIN_REQUIRED)
        return _err_out(_map_ctap_error("Assertion failed", e))
    except Exception as e:
        return _err_out(f"Assertion failed: {e}")

    print(json.dumps({"prf_output": _b64(prf_output)}))
    return 0


def _assert_hmac(ctap2: Ctap2, credential_id: bytes, salt: bytes,
                 pin: Optional[str]) -> bytes:
    """Do a getAssertion with the hmac-secret extension and return the 32-byte
    HMAC output. Tries no-UV path first, falls back to PIN if supplied.

    Raises CtapError on PIN-required (caller decides whether to surface).
    """
    challenge = os.urandom(32)
    allow_list = [{"type": "public-key", "id": credential_id}]

    # HmacSecretExtension wraps the ECDH ceremony required to encrypt our salt
    # to the device's transient public key and decrypt the response. It also
    # stashes the negotiated shared secret on the instance for use later by
    # process_get_output, so the same instance must be used for both calls.
    hmac_ext = HmacSecretExtension(ctap2)

    # Returns the per-CTAP extension value dict (1=keyAgreement, 2=saltEnc,
    # 3=saltAuth, 4=protocolVersion) ready to drop into the extensions map.
    hmac_input = hmac_ext.process_get_input({
        "hmacGetSecret": {"salt1": salt},
    })
    if hmac_input is None:
        raise RuntimeError("Your key reports hmac-secret support but the "
                           "library refused to build the request.")

    extensions = {HmacSecretExtension.NAME: hmac_input}

    pin_protocol_ver = None
    pin_uv_param = None
    if pin:
        pin_protocol_ver, pin_uv_param = _build_pin_uv_param(
            ctap2, pin,
            permissions=ClientPin.PERMISSION.GET_ASSERTION,
            client_data_hash=challenge,
            rp_id=RP_ID,
        )

    assertion = ctap2.get_assertion(
        RP_ID, challenge, allow_list,
        extensions=extensions,
        pin_uv_protocol=pin_protocol_ver,
        pin_uv_param=pin_uv_param,
    )

    # process_get_output decrypts the extension blob using the shared secret
    # we negotiated above. Takes the whole assertion response object.
    output = hmac_ext.process_get_output(assertion)
    secret_obj = output.get("hmacGetSecret")
    secret = getattr(secret_obj, "output1", None)
    if not secret or len(secret) != 32:
        raise RuntimeError(
            "Your key did not return an hmac-secret value. It may not fully "
            "support the extension, or this is a different key from the one "
            "you enrolled."
        )
    return secret


# ── Entry point ─────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Liminal YubiKey helper")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("is-present")

    p_enroll = sub.add_parser("enroll")
    p_enroll.add_argument("--pin", default=None,
                          help="Optional FIDO2 PIN if the device demands UV")

    p_assert = sub.add_parser("assert")
    p_assert.add_argument("--credential-id", required=True,
                          help="Base64 credential ID from prior enrollment")
    p_assert.add_argument("--salt", required=True,
                          help="Base64 32-byte hmac-secret salt")
    p_assert.add_argument("--pin", default=None,
                          help="Optional FIDO2 PIN if the device demands UV")

    args = parser.parse_args()

    handlers = {
        "is-present": cmd_is_present,
        "enroll": cmd_enroll,
        "assert": cmd_assert,
    }
    try:
        sys.exit(handlers[args.cmd](args))
    except KeyboardInterrupt:
        sys.exit(_err_out("Cancelled"))
    except Exception as e:
        sys.exit(_err_out(f"Unexpected error: {e}"))


if __name__ == "__main__":
    main()
