"""scripts/backfill_metrics.py — rellena las columnas SQL de métricas en LibreSessionUpload.

Uso:
    py scripts/backfill_metrics.py

Requiere las mismas variables de entorno que la API (SECRET_KEY, DATABASE_URL si no es SQLite).
El script procesa en batches de 100 registros, muestra progreso y continúa ante errores de sesiones
individuales sin abortar el proceso completo.
"""

import json
import sys
from pathlib import Path

# Agregar el root del proyecto al sys.path para importar app.*
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal, engine
from app.models.libre_session_upload import LibreSessionUpload


def _extract_metrics(json_payload: str) -> dict:
    """Parsea json_payload y extrae las 8 métricas SQL.

    Retorna un dict con las claves correspondientes a las columnas del modelo.
    Si una métrica no se puede calcular, su valor es None.
    """
    try:
        raw: dict = json.loads(json_payload)
    except (json.JSONDecodeError, TypeError):
        return {}

    metrics: dict = {}

    # duration_seconds: campo totalSeconds del JSON raíz.
    ts = raw.get("totalSeconds")
    if ts is not None:
        try:
            metrics["duration_seconds"] = int(ts)
        except (TypeError, ValueError):
            metrics["duration_seconds"] = None
    else:
        metrics["duration_seconds"] = None

    # paddlers_count: campo paddlersCount del JSON raíz.
    pc = raw.get("paddlersCount")
    if pc is not None:
        try:
            metrics["paddlers_count"] = int(pc)
        except (TypeError, ValueError):
            metrics["paddlers_count"] = None
    else:
        metrics["paddlers_count"] = None

    # Métricas derivadas de dataPoints.
    data_points: list = raw.get("dataPoints") or []

    if not data_points:
        metrics.update(
            distance_meters=None,
            stroke_count=None,
            avg_spm=None,
            max_speed=None,
            avg_speed=None,
            has_gps=None,
        )
        return metrics

    # Último dataPoint contiene los valores acumulados totales.
    last = data_points[-1]

    # distance_meters: distanceMeters del último punto.
    dm = last.get("distanceMeters")
    try:
        metrics["distance_meters"] = float(dm) if dm is not None else None
    except (TypeError, ValueError):
        metrics["distance_meters"] = None

    # stroke_count: paladas del último punto (valor acumulado).
    paladas = last.get("paladas")
    try:
        metrics["stroke_count"] = int(paladas) if paladas is not None else None
    except (TypeError, ValueError):
        metrics["stroke_count"] = None

    # max_speed: max de speedKmh en todos los dataPoints.
    speeds = []
    for dp in data_points:
        spd = dp.get("speedKmh")
        if spd is not None:
            try:
                speeds.append(float(spd))
            except (TypeError, ValueError):
                pass
    metrics["max_speed"] = max(speeds) if speeds else None

    # avg_speed: promedio de speedKmh > 0 (excluye reposo).
    nonzero_speeds = [s for s in speeds if s > 0]
    metrics["avg_speed"] = (sum(nonzero_speeds) / len(nonzero_speeds)) if nonzero_speeds else None

    # avg_spm: promedio de spm > 0 en todos los dataPoints.
    spms = []
    for dp in data_points:
        spm = dp.get("spm")
        if spm is not None:
            try:
                v = float(spm)
                if v > 0:
                    spms.append(v)
            except (TypeError, ValueError):
                pass
    metrics["avg_spm"] = (sum(spms) / len(spms)) if spms else None

    # has_gps: True si al menos un dataPoint tiene latitude y longitude no nulos.
    has_gps = any(
        dp.get("latitude") is not None and dp.get("longitude") is not None
        for dp in data_points
    )
    metrics["has_gps"] = has_gps

    return metrics


def backfill(batch_size: int = 100) -> None:
    db: Session = SessionLocal()
    try:
        total: int = db.query(LibreSessionUpload).count()
        print(f"Total de sesiones en la DB: {total}")
        if total == 0:
            print("Nada que procesar.")
            return

        processed = 0
        errors = 0
        offset = 0

        while True:
            rows = db.scalars(
                select(LibreSessionUpload)
                .order_by(LibreSessionUpload.id)
                .offset(offset)
                .limit(batch_size)
            ).all()

            if not rows:
                break

            for row in rows:
                try:
                    metrics = _extract_metrics(row.json_payload)
                    for col, val in metrics.items():
                        if getattr(row, col) is None:
                            setattr(row, col, val)
                    processed += 1
                except Exception as exc:
                    errors += 1
                    print(f"  ERROR en sesión id={row.id}: {exc}")

            db.commit()
            offset += batch_size
            print(f"Procesadas {min(processed + errors, total)}/{total} sesiones "
                  f"(ok={processed}, errores={errors})")

        print(f"\nBackfill completado. {processed} sesiones actualizadas, {errors} con errores.")
    finally:
        db.close()


if __name__ == "__main__":
    backfill()
