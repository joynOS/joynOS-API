import sys
import os
from logging.config import fileConfig
from app.core.config import settings
from app.core.database import Base
from app.models.user_db.user_db import User
from app.models.quiz_db.quiz_db import Quiz
from sqlalchemy import engine_from_config, pool
from alembic import context

# local
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Docker
# DATABASE_URL = (
#     f"postgresql://{os.environ.get('DB_USER')}:{os.environ.get('DB_PASSWORD')}"
#     f"@{os.environ.get('DB_HOST')}:{os.environ.get('DB_PORT')}/{os.environ.get('DB_NAME')}"
# )
# config = context.config
# config.set_main_option("sqlalchemy.url", DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
