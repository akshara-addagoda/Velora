"""Validate the existing local database, then save credentials only in ignored .env."""

from getpass import getpass
from pathlib import Path

import psycopg
from dotenv import set_key
from sqlalchemy import URL


def main():
    password = getpass("Local PostgreSQL password (hidden): ")
    try:
        # Read only the maintenance database catalogue to resolve quoted/case-sensitive names.
        with psycopg.connect(
            host="127.0.0.1",
            port=5432,
            dbname="postgres",
            user="postgres",
            password=password,
            connect_timeout=5,
        ) as maintenance:
            with maintenance.cursor() as cursor:
                cursor.execute(
                    "SELECT datname FROM pg_database WHERE lower(trim(datname)) = 'velora'"
                )
                matches = [row[0] for row in cursor.fetchall()]
                if len(matches) != 1:
                    raise SystemExit(
                        "No unique existing Velora database was found. No database or configuration was changed."
                    )
                database_name = matches[0]
        with psycopg.connect(
            host="127.0.0.1",
            port=5432,
            dbname=database_name,
            user="postgres",
            password=password,
            connect_timeout=5,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT current_database(), current_user, current_setting('server_version')"
                )
                database, user, version = cursor.fetchone()
                print(f"Connected to {database} as {user}; PostgreSQL {version}")
                cursor.execute(
                    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
                )
                tables = [row[0] for row in cursor.fetchall()]
                print("Existing public tables: " + (", ".join(tables) or "none"))
                if "alembic_version" in tables:
                    cursor.execute("SELECT version_num FROM public.alembic_version")
                    print(
                        "Existing Alembic revisions: "
                        + ", ".join(row[0] for row in cursor.fetchall())
                    )
    except psycopg.Error as error:
        detail = str(error).lower()
        reason = (
            "Password authentication failed"
            if "password authentication failed" in detail
            else "Database velora does not exist"
            if "does not exist" in detail
            else "PostgreSQL refused the connection"
            if "refused" in detail
            else "PostgreSQL connection timed out"
            if "timeout" in detail or "timed out" in detail
            else "PostgreSQL could not be reached or authenticated"
        )
        raise SystemExit(reason + ". No configuration or database data was changed.") from None
    url = URL.create(
        "postgresql+psycopg",
        username="postgres",
        password=password,
        host="127.0.0.1",
        port=5432,
        database=database_name,
    )
    env = Path(__file__).resolve().parents[2] / ".env"
    env.touch(exist_ok=True)
    set_key(str(env), "DATABASE_URL", url.render_as_string(hide_password=False))
    set_key(str(env), "FRONTEND_ORIGIN", "http://127.0.0.1:5173")
    print(
        "Saved PostgreSQL configuration in the ignored root .env. No tables or records were changed."
    )


if __name__ == "__main__":
    main()
