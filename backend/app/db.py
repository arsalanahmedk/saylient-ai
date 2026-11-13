"""SQLAlchemy engine/session setup.

Prototype note: tables are created with ``Base.metadata.create_all`` at
application startup. That is the prototype equivalent of Alembic migrations
(see 07-engineering/BACKEND_GUIDE.md, which asks for "Alembic migrations or
an equivalent reviewed stack"). Real migrations must replace ``create_all``
before production, because ``create_all`` never alters existing tables.
Documented in backend/README.md.
"""

from __future__ import annotations

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()


def create_engine_for(database_url: str) -> Engine:
    """Build an engine. SQLite uses a file (default ``./saylient.db``) or
    ``postgresql://...`` in staging/production (see DEPLOYMENT.md)."""
    connect_args: dict = {}
    if database_url.startswith("sqlite:///"):
        # SQLite sessions run in one process here; allow cross-thread use and
        # enforce foreign keys so ORM cascades are backed by the database.
        connect_args = {"check_same_thread": False}
    engine = create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)

    if database_url.startswith("sqlite:///"):

        @event.listens_for(engine, "connect")
        def _enable_sqlite_foreign_keys(dbapi_connection, connection_record):  # noqa: N802
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


def create_session_factory(engine: Engine) -> sessionmaker:
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def init_db(engine: Engine) -> None:
    """Create all tables. Import models first so every table is registered."""
    # Imported here to avoid a circular import at module load time.
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _migrate_add_google_sub(engine)


def _migrate_add_google_sub(engine: Engine) -> None:
    """Lightweight additive migration for the ``google_sub`` column.

    ``create_all`` never alters existing tables, so a column added to the
    model needs an explicit ALTER on databases created before it existed.
    Idempotent and safe to run at every startup; a no-op on fresh
    databases (where ``create_all`` already made the column).
    """
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    columns = {c["name"] for c in inspector.get_columns("users")}
    if "google_sub" in columns:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN google_sub VARCHAR(255)"))
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub "
                "ON users (google_sub)"
            )
        )
