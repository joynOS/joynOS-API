from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # email
    # MAIL_FROM: str
    # MAIL_PASSWORD: str
    # ADMIN_INVITE_SECRET: str

    # Banco de dados
    DATABASE_URL: str


    class Config:
        env_file = ".env"


settings = Settings()