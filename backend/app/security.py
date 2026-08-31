import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass


SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SALT_BYTES = 16


class InvalidSession(ValueError):
    pass


@dataclass(frozen=True)
class SessionClaims:
    user_id: int
    username: str
    expires_at: int


def _encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
    )
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_encode(salt)}${_encode(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, raw_n, raw_r, raw_p, raw_salt, raw_digest = encoded.split("$", 5)
        if algorithm != "scrypt":
            return False
        salt = _decode(raw_salt)
        expected = _decode(raw_digest)
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=int(raw_n),
            r=int(raw_r),
            p=int(raw_p),
            dklen=len(expected),
        )
        return hmac.compare_digest(actual, expected)
    except (TypeError, ValueError):
        return False


def create_session_token(
    *,
    user_id: int,
    username: str,
    secret: str,
    max_age_seconds: int,
    now: int | None = None,
) -> str:
    issued_at = int(time.time()) if now is None else now
    payload = {
        "sub": user_id,
        "name": username,
        "exp": issued_at + max_age_seconds,
    }
    encoded_payload = _encode(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    signature = hmac.new(secret.encode("utf-8"), encoded_payload.encode("ascii"), hashlib.sha256).digest()
    return f"{encoded_payload}.{_encode(signature)}"


def read_session_token(token: str, secret: str, *, now: int | None = None) -> SessionClaims:
    try:
        encoded_payload, encoded_signature = token.split(".", 1)
        expected_signature = hmac.new(
            secret.encode("utf-8"),
            encoded_payload.encode("ascii"),
            hashlib.sha256,
        ).digest()
        if not hmac.compare_digest(_decode(encoded_signature), expected_signature):
            raise InvalidSession("会话签名无效")
        payload = json.loads(_decode(encoded_payload))
        expires_at = int(payload["exp"])
        current_time = int(time.time()) if now is None else now
        if expires_at <= current_time:
            raise InvalidSession("会话已过期")
        return SessionClaims(
            user_id=int(payload["sub"]),
            username=str(payload["name"]),
            expires_at=expires_at,
        )
    except (InvalidSession, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        if isinstance(exc, InvalidSession):
            raise
        raise InvalidSession("会话格式无效") from exc
