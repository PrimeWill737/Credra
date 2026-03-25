from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Always load `.env` from the `processing/` folder (not whatever the shell cwd is).
_PROCESSING_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_PROCESSING_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Default matches docker-compose: credra/credra on host port 5433 (see README).
    database_url: str = "postgresql://credra:credra@127.0.0.1:5433/credra"

    # Optional override for psycopg2 `sslmode`. Leave unset for auto:
    # localhost → no extra args; remote (e.g. Supabase) → sslmode=require.
    # Set DATABASE_SSLMODE=disable only for unusual local tunnels.
    database_sslmode: str | None = None


settings = Settings()
