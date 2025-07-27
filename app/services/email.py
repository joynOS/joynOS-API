import aiosmtplib
from email.message import EmailMessage
from app.core.config import settings


async def send_email(to_email: str, subject: str, body: str):
    message = EmailMessage()
    message["From"] = settings.MAIL_FROM
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    await aiosmtplib.send(
        message,
        hostname="smtp.gmail.com",
        port=587,
        start_tls=True,
        username=settings.MAIL_FROM,
        password=settings.MAIL_PASSWORD,
    )
