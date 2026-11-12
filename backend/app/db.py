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
