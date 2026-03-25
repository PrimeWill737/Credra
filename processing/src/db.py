from urllib.parse import urlparse

from sqlalchemy import Float, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


class TransactionRow(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[str] = mapped_column(String(128), index=True)
    amount: Mapped[float] = mapped_column(Float)
    narration: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    raw_json: Mapped[str | None] = mapped_column(Text, nullable=True)


def _connect_args(database_url: str) -> dict:
    """Supabase and other cloud Postgres require TLS; local Docker/localhost usually do not."""
    if settings.database_sslmode:
        if settings.database_sslmode.lower() == "disable":
            return {}
        return {"sslmode": settings.database_sslmode}

    try:
        parsed = urlparse(database_url)
    except Exception:
        return {}

    query = (parsed.query or "").lower()
    if "sslmode=" in query:
        return {}

    host = (parsed.hostname or "").lower()
    if host in ("localhost", "127.0.0.1", "::1"):
        return {}

    return {"sslmode": "require"}


engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    connect_args=_connect_args(settings.database_url),
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
