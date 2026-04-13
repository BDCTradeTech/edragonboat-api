"""Envío de correo simple (invitaciones). Requiere SMTP configurado en Settings."""

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

log = logging.getLogger(__name__)

INVITE_DEFAULT_PASSWORD = "12345678"


def send_team_invite_email(
    settings: object,
    *,
    to_email: str,
    team_name: str,
    temp_password: str,
) -> bool:
    smtp_host = str(getattr(settings, "smtp_host", "") or "").strip()
    if not smtp_host:
        log.warning("SMTP_HOST vacío: no se envía invitación a %s", to_email)
        return False
    smtp_user = str(getattr(settings, "smtp_user", "") or "")
    smtp_password = str(getattr(settings, "smtp_password", "") or "")
    smtp_from = str(getattr(settings, "smtp_from", "") or "")
    smtp_port = int(getattr(settings, "smtp_port", 587) or 587)
    smtp_use_tls = bool(getattr(settings, "smtp_use_tls", True))
    app_url = str(getattr(settings, "app_public_url", "https://app.edragonboat.com") or "https://app.edragonboat.com")

    from_addr = (smtp_from or smtp_user or "").strip()
    if not from_addr:
        log.warning("SMTP_FROM / SMTP_USER vacío: no se envía invitación")
        return False

    subject = f"Invitación al equipo {team_name} — E-DragonBoat"
    body = (
        f"Hola,\n\n"
        f"Te invitaron al equipo «{team_name}» en E-DragonBoat.\n\n"
        f"Podés entrar al panel en: {app_url.rstrip('/')}/#/login\n"
        f"Usuario (email): {to_email}\n"
        f"Contraseña provisional: {temp_password}\n\n"
        f"Te recomendamos cambiarla en Cuenta → Cambiar contraseña.\n\n"
        f"— E-DragonBoat\n"
    )

    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.attach(MIMEText(body, "plain", "utf-8"))

    try:
        if smtp_use_tls:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
                server.starttls()
                if smtp_user:
                    server.login(smtp_user, smtp_password)
                server.sendmail(from_addr, [to_email], msg.as_string())
        else:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=30) as server:
                if smtp_user:
                    server.login(smtp_user, smtp_password)
                server.sendmail(from_addr, [to_email], msg.as_string())
        log.info("Invitación enviada a %s", to_email)
        return True
    except Exception:
        log.exception("Fallo al enviar email a %s", to_email)
        return False
