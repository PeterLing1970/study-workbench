import os
import unittest

os.environ.setdefault("AUTH_USERNAME", "student")
os.environ.setdefault("AUTH_PASSWORD", "student-password-123")
os.environ.setdefault("AUTH_PARENT_USERNAME", "parent")
os.environ.setdefault("AUTH_PARENT_PASSWORD", "parent-password-1234")
os.environ.setdefault("AUTH_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from fastapi import HTTPException
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.auth import ensure_auth_users, ensure_user_role_schema, require_student
from app.config import Settings
from app.database import Base
from app.models import User


def make_settings() -> Settings:
    return Settings(
        auth_username="student",
        auth_password="student-password-123",
        auth_parent_username="parent",
        auth_parent_password="parent-password-1234",
        auth_secret="test-secret-that-is-longer-than-thirty-two-characters",
    )


class RoleInitializationTests(unittest.TestCase):
    def test_creates_student_and_parent_accounts(self) -> None:
        engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            users = ensure_auth_users(db, make_settings())

        self.assertEqual({(user.username, user.role) for user in users}, {("student", "student"), ("parent", "parent")})

    def test_existing_users_table_receives_role_column(self) -> None:
        engine = create_engine("sqlite+pysqlite:///:memory:")
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, username VARCHAR(40) NOT NULL)"))

        ensure_user_role_schema(engine)

        self.assertIn("role", {column["name"] for column in inspect(engine).get_columns("users")})


class RolePermissionTests(unittest.TestCase):
    def test_student_can_use_write_operations(self) -> None:
        student = User(id=1, username="student", password_hash="unused", role="student")
        self.assertIs(require_student(student), student)

    def test_parent_is_rejected_from_write_operations(self) -> None:
        parent = User(id=2, username="parent", password_hash="unused", role="parent")
        with self.assertRaises(HTTPException) as raised:
            require_student(parent)

        self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
