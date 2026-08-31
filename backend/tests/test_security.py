import unittest

from app.security import InvalidSession, create_session_token, hash_password, read_session_token, verify_password


class PasswordSecurityTests(unittest.TestCase):
    def test_hash_is_salted_and_verifies(self) -> None:
        first = hash_password("family-password-123")
        second = hash_password("family-password-123")

        self.assertNotEqual(first, second)
        self.assertTrue(verify_password("family-password-123", first))
        self.assertFalse(verify_password("wrong-password", first))


class SessionSecurityTests(unittest.TestCase):
    secret = "test-secret-that-is-longer-than-thirty-two-characters"

    def test_valid_token_round_trip(self) -> None:
        token = create_session_token(
            user_id=7,
            username="student",
            secret=self.secret,
            max_age_seconds=600,
            now=1_000,
        )
        claims = read_session_token(token, self.secret, now=1_001)

        self.assertEqual(claims.user_id, 7)
        self.assertEqual(claims.username, "student")
        self.assertEqual(claims.expires_at, 1_600)

    def test_tampered_token_is_rejected(self) -> None:
        token = create_session_token(
            user_id=7,
            username="student",
            secret=self.secret,
            max_age_seconds=600,
            now=1_000,
        )
        payload, signature = token.split(".", 1)
        tampered = f"{payload[:-1]}A.{signature}"

        with self.assertRaises(InvalidSession):
            read_session_token(tampered, self.secret, now=1_001)

    def test_expired_token_is_rejected(self) -> None:
        token = create_session_token(
            user_id=7,
            username="student",
            secret=self.secret,
            max_age_seconds=60,
            now=1_000,
        )

        with self.assertRaises(InvalidSession):
            read_session_token(token, self.secret, now=1_060)


if __name__ == "__main__":
    unittest.main()
