import random
import csv
import io
from datetime import date, datetime, timedelta
from flask import Flask, Response, jsonify, render_template, request

app = Flask(__name__)

LICENSE_CAPACITY = 55
LICENSE_TYPES = ["IVR Voz", "Canales digitales"]
TEAMS = ["Simple ATC", "Simple TLV"]
CAMPAIGNS = ["Atención General", "Retención", "Ventas"]
SUPERVISORS = ["Supervisor 1", "Supervisor 2", "Supervisor 3"]
PROFILES = ["Voice Agent", "Digital Agent", "Supervisor"]


def format_duration(seconds):
    hours, remainder = divmod(max(0, int(seconds)), 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def classify_license_usage(used):
    if used >= 51:
        return "Crítico", "critical"
    if used >= 46:
        return "Alerta", "warning"
    return "Estable", "stable"


def normalize_team(team):
    if not team or team in {"all", "Todos"}:
        return "all"
    if team not in TEAMS:
        raise ValueError("Equipo no válido")
    return team


def filter_agents_by_team(agents, team):
    selected_team = normalize_team(team)
    if selected_team == "all":
        return agents
    return [agent for agent in agents if agent["team"] == selected_team]


def build_queue_snapshot(team="all"):
    selected_team = normalize_team(team)
    if selected_team == "all":
        team_snapshots = [build_queue_snapshot(item) for item in TEAMS]
        return {
            "active_waiting": sum(item["active_waiting"] for item in team_snapshots),
            "longest_wait_sec": max(item["longest_wait_sec"] for item in team_snapshots),
            "available_agents": sum(item["available_agents"] for item in team_snapshots),
            "busy_agents": sum(item["busy_agents"] for item in team_snapshots),
            "wrap_up_agents": sum(item["wrap_up_agents"] for item in team_snapshots),
            "offup_agents": sum(item["offup_agents"] for item in team_snapshots),
        }
    rng = random.Random(f"queue:{date.today().isoformat()}:{selected_team}")
    return {
        "active_waiting": rng.randint(2, 8),
        "longest_wait_sec": rng.randint(20, 80),
        "available_agents": rng.randint(1, 5),
        "busy_agents": rng.randint(3, 6),
        "wrap_up_agents": rng.randint(0, 2),
        "offup_agents": 1,
    }


def build_agent_records(reference=None):
    now = (reference or datetime.now()).replace(microsecond=0)
    records = []
    states = ["Disponible", "En interacción", "Gestión posterior", "Pausa"]
    for index in range(LICENSE_CAPACITY):
        online = index < 48
        rng = random.Random(f"agent:{now.date()}:{index}")
        login_minutes = 90 + (index % 12) * 13
        login_at = now - timedelta(minutes=login_minutes)
        logout_at = None if online else now - timedelta(minutes=15 + (index % 8) * 17)
        logged_seconds = int(((logout_at or now) - login_at).total_seconds())
        interaction_seconds = int(logged_seconds * rng.uniform(0.38, 0.58))
        acw_seconds = int(logged_seconds * rng.uniform(0.06, 0.13))
        pause_seconds = int(logged_seconds * rng.uniform(0.05, 0.15))
        available_seconds = max(0, logged_seconds - interaction_seconds - acw_seconds - pause_seconds)
        state = states[index % len(states)] if online else "Offline"
        queue_active = online and state != "Pausa"
        license_type = LICENSE_TYPES[index % len(LICENSE_TYPES)]
        profile = PROFILES[index % len(PROFILES)]
        team = "Simple ATC" if index % 3 == 1 else "Simple TLV"
        records.append({
            "user": f"Asesor {index + 1:02d}",
            "connection": "Online" if online else "Offline",
            "license_active": online,
            "license_type": license_type,
            "role": profile,
            "organization": team,
            "team": team,
            "campaign": CAMPAIGNS[index % len(CAMPAIGNS)],
            "supervisor": SUPERVISORS[index % len(SUPERVISORS)],
            "profile": profile,
            "login_at": login_at,
            "login_date": login_at.strftime("%Y-%m-%d"),
            "logout_at": logout_at,
            "connection_seconds": int(((logout_at or now) - login_at).total_seconds()) if not online else int((now - login_at).total_seconds()),
            "status_seconds": int((now - (login_at if online else logout_at)).total_seconds()),
            "queue_state": state if online else "Fuera de cola",
            "queue_active": queue_active,
            "available_seconds": available_seconds,
            "interaction_seconds": interaction_seconds,
            "acw_seconds": acw_seconds,
            "pause_seconds": pause_seconds,
            "occupancy": round((interaction_seconds + acw_seconds) / max(1, logged_seconds) * 100, 1),
        })
    return records


def build_monitor_snapshot(team="all"):
    agents = filter_agents_by_team(build_agent_records(), team)
    capacity = len(agents)
    used = sum(agent["license_active"] for agent in agents)
    utilization = round(used / capacity * 100, 1) if capacity else 0
    status, status_key = classify_license_usage(used)

    def distribution(field):
        counts = {}
        for agent in agents:
            if agent["license_active"]:
                name = agent[field]
                counts[name] = counts.get(name, 0) + 1
        return [{"name": name, "count": count} for name, count in sorted(counts.items())]

    return {
        "capacity": capacity,
        "used": used,
        "available": LICENSE_CAPACITY - used,
        "utilization": utilization,
        "status": status,
        "status_key": status_key,
        "online": used,
        "offline": len(agents) - used,
        "by_type": distribution("license_type"),
        "by_role": distribution("role"),
        "by_organization": distribution("organization"),
        "agents": agents,
        "updated_at": datetime.now().strftime("%H:%M:%S"),
    }


def filtered_agent_records(args):
    start_date = date.fromisoformat(args.get("from", date.today().isoformat()))
    end_date = date.fromisoformat(args.get("to", date.today().isoformat()))
    start_time = datetime.strptime(args.get("start_time", "00:00"), "%H:%M").time()
    end_time = datetime.strptime(args.get("end_time", "23:59"), "%H:%M").time()
    if end_date < start_date or end_time < start_time:
        raise ValueError("El rango de fechas u horas no es válido")
    if (end_date - start_date).days > 365:
        raise ValueError("El rango máximo de consulta es de 366 días")

    selected_team = normalize_team(args.get("team"))
    filters = {
        "campaign": "campaign",
        "supervisor": "supervisor",
        "profile": "profile",
    }
    filtered = []
    current_day = start_date
    while current_day <= end_date:
        reference = datetime.combine(current_day, datetime.now().time())
        for record in build_agent_records(reference):
            login_at = record["login_at"]
            if not (start_time <= login_at.time() <= end_time):
                continue
            if selected_team != "all" and record["team"] != selected_team:
                continue
            if any(args.get(key) and args[key] != record[field] for key, field in filters.items()):
                continue
            filtered.append(record)
        current_day += timedelta(days=1)
    return filtered


def serialize_agent_record(record):
    return {
        "user": record["user"],
        "connection": record["connection"],
        "license_active": record["license_active"],
        "license_type": record["license_type"],
        "role": record["role"],
        "organization": record["organization"],
        "team": record["team"],
        "campaign": record["campaign"],
        "supervisor": record["supervisor"],
        "profile": record["profile"],
        "login_date": record["login_at"].strftime("%Y-%m-%d"),
        "login_at": record["login_at"].strftime("%H:%M:%S"),
        "logout_at": record["logout_at"].strftime("%H:%M:%S") if record["logout_at"] else "En línea",
        "connection_time": format_duration(record["connection_seconds"]),
        "status_time": format_duration(record["status_seconds"]),
        "queue_state": record["queue_state"],
        "queue_active": record["queue_active"],
        "available_time": format_duration(record["available_seconds"]),
        "interaction_time": format_duration(record["interaction_seconds"]),
        "acw_time": format_duration(record["acw_seconds"]),
        "pause_time": format_duration(record["pause_seconds"]),
        "occupancy": record["occupancy"],
    }


def _generate_team_series_data(range_name: str, dnis: str, team: str):
    rng = random.Random(f"{range_name}:{date.today().isoformat()}:{dnis}:{team}")
    labels = []
    if range_name in {"today", "yesterday"}:
        labels = [f"{hour:02d}:00" for hour in range(8, 22)]
    elif range_name == "7d":
        labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    elif range_name == "30d":
        labels = [f"D{i * 3 + 1}" for i in range(10)]
    elif range_name == "ytd":
        labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    else:
        labels = [f"P{i + 1}" for i in range(8)]

    data = []
    for index, label in enumerate(labels):
        offered = rng.randint(80, 210)
        answered = int(offered * rng.uniform(0.82, 0.96))
        abandoned = max(0, offered - answered)
        sla = min(100, int((answered / offered) * 100) + rng.randint(0, 8))
        asa = rng.randint(8, 26)
        talk = rng.randint(180, 260)
        hold = rng.randint(12, 35)
        acw = rng.randint(18, 42)
        data.append(
            {
                "label": label,
                "offered": offered,
                "answered": answered,
                "abandoned": abandoned,
                "sla": sla,
                "asa": asa,
                "talk": talk,
                "hold": hold,
                "acw": acw,
                "aht": talk + hold + acw,
                "dnis": dnis,
            }
        )
    return data


def generate_series_data(range_name: str = "today", dnis: str = "582129175656", team: str = "all"):
    selected_team = normalize_team(team)
    if selected_team != "all":
        return _generate_team_series_data(range_name, dnis, selected_team)

    team_series = [_generate_team_series_data(range_name, dnis, item) for item in TEAMS]
    combined = []
    for rows in zip(*team_series):
        offered = sum(row["offered"] for row in rows)
        answered = sum(row["answered"] for row in rows)
        average = lambda field: round(sum(row[field] * row["offered"] for row in rows) / offered, 1)
        talk = round(average("talk"))
        hold = round(average("hold"))
        acw = round(average("acw"))
        combined.append({
            "label": rows[0]["label"],
            "offered": offered,
            "answered": answered,
            "abandoned": sum(row["abandoned"] for row in rows),
            "sla": average("sla"),
            "asa": round(average("asa")),
            "talk": talk,
            "hold": hold,
            "acw": acw,
            "aht": talk + hold + acw,
            "dnis": dnis,
        })
    return combined


def build_metrics(series):
    total_offered = sum(item["offered"] for item in series)
    total_answered = sum(item["answered"] for item in series)
    total_abandoned = sum(item["abandoned"] for item in series)
    avg_sla = round(sum(item["sla"] for item in series) / len(series), 1)
    avg_asa = round(sum(item["asa"] for item in series) / len(series), 1)
    avg_aht = round(sum(item["aht"] for item in series) / len(series), 1)
    return {
        "offered": total_offered,
        "answered": total_answered,
        "abandoned": total_abandoned,
        "answer_rate": round((total_answered / total_offered) * 100, 1) if total_offered else 0,
        "abandon_rate": round((total_abandoned / total_offered) * 100, 1) if total_offered else 0,
        "sla": avg_sla,
        "asa": avg_asa,
        "aht": avg_aht,
    }


def build_license_snapshot(team="all"):
    selected_team = normalize_team(team)
    monitoring = build_monitor_snapshot(selected_team)
    total = monitoring["capacity"]
    used = monitoring["used"]
    available = total - used
    pending = 0
    expiring_soon = 0
    if selected_team == "all":
        type_capacity = {"IVR Voz": 30, "Canales digitales": 25}
    else:
        team_agents = filter_agents_by_team(build_agent_records(), selected_team)
        type_capacity = {
            name: sum(agent["license_type"] == name for agent in team_agents)
            for name in LICENSE_TYPES
        }
    by_type = []
    for usage in monitoring["by_type"]:
        capacity = type_capacity[usage["name"]]
        by_type.append({
            "name": usage["name"],
            "used": usage["count"],
            "capacity": capacity,
            "available": capacity - usage["count"],
            "utilization": round(usage["count"] / capacity * 100),
        })
    return {
        "total": total,
        "used": used,
        "available": available,
        "utilization": monitoring["utilization"],
        "status": monitoring["status"],
        "status_key": monitoring["status_key"],
        "pending": pending,
        "expiring_soon": expiring_soon,
        "by_type": by_type,
    }


def _build_team_management_report(period: str, selected_value: str, team: str):
    selected_team = normalize_team(team)
    if period not in {"interval", "date", "month", "year"}:
        period = "interval"

    if period == "date":
        selected_date = date.fromisoformat(selected_value)
        labels = [f"{hour:02d}:{minute:02d}" for hour in range(8, 18) for minute in (0, 30)]
        label_prefix = ""
        seed_value = selected_date.isoformat()
    elif period == "month":
        selected_month = datetime.strptime(selected_value, "%Y-%m").date()
        next_month = date(selected_month.year + (selected_month.month == 12), selected_month.month % 12 + 1, 1)
        days = (next_month - selected_month).days
        labels = [f"Día {day:02d}" for day in range(1, days + 1)]
        label_prefix = ""
        seed_value = selected_value
    elif period == "year":
        year = int(selected_value)
        labels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
        label_prefix = ""
        seed_value = str(year)
    else:
        labels = [f"{hour:02d}:{minute:02d} - {hour:02d}:{minute + 30:02d}" if minute == 0 else f"{hour:02d}:30 - {hour + 1:02d}:00" for hour in range(8, 18) for minute in (0, 30)]
        label_prefix = ""
        selected_value = datetime.now().date().isoformat()
        seed_value = selected_value

    rng = random.Random(f"{period}:{seed_value}:{selected_team}")
    series = []
    for label in labels:
        offered = rng.randint(380, 620) if period in {"interval", "date"} else rng.randint(1200, 2800)
        answered = int(offered * rng.uniform(0.84, 0.96))
        series.append({
            "label": f"{label_prefix}{label}",
            "offered": offered,
            "answered": answered,
            "abandoned": offered - answered,
            "sla": round(rng.uniform(84, 96), 1),
            "asa": rng.randint(12, 28),
            "agents": rng.randint(12, 20),
        })

    total_offered = sum(row["offered"] for row in series)
    total_answered = sum(row["answered"] for row in series)
    return {
        "period": period,
        "selected_value": selected_value,
        "summary": {
            "handled": total_answered,
            "contact_rate": round(total_answered / total_offered * 100, 1) if total_offered else 0,
            "average_wait": round(sum(row["asa"] for row in series) / len(series)) if series else 0,
            "occupancy": round(rng.uniform(68, 88), 1),
        },
        "rows": series,
    }


def build_management_report(period: str, selected_value: str, team: str = "all"):
    selected_team = normalize_team(team)
    if selected_team != "all":
        return _build_team_management_report(period, selected_value, selected_team)

    reports = [_build_team_management_report(period, selected_value, item) for item in TEAMS]
    rows = []
    for team_rows in zip(*(report["rows"] for report in reports)):
        offered = sum(row["offered"] for row in team_rows)
        answered = sum(row["answered"] for row in team_rows)
        rows.append({
            "label": team_rows[0]["label"],
            "offered": offered,
            "answered": answered,
            "abandoned": sum(row["abandoned"] for row in team_rows),
            "sla": round(sum(row["sla"] * row["offered"] for row in team_rows) / offered, 1),
            "asa": round(sum(row["asa"] * row["offered"] for row in team_rows) / offered),
            "agents": sum(row["agents"] for row in team_rows),
        })
    total_offered = sum(row["offered"] for row in rows)
    total_answered = sum(row["answered"] for row in rows)
    total_handled = sum(report["summary"]["handled"] for report in reports)
    return {
        "period": reports[0]["period"],
        "selected_value": reports[0]["selected_value"],
        "summary": {
            "handled": total_handled,
            "contact_rate": round(total_answered / total_offered * 100, 1) if total_offered else 0,
            "average_wait": round(sum(row["asa"] * row["offered"] for row in rows) / total_offered) if total_offered else 0,
            "occupancy": round(sum(report["summary"]["occupancy"] * report["summary"]["handled"] for report in reports) / total_handled, 1) if total_handled else 0,
        },
        "rows": rows,
    }


@app.route("/")
def index():
    dnis = "582129175656"
    media = "IVR Voz"
    try:
        selected_team = normalize_team(request.args.get("team", "all"))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    range_name = "today"
    series = generate_series_data(range_name, dnis, selected_team)
    metrics = build_metrics(series)
    licenses = build_license_snapshot(selected_team)
    queue_metrics = build_queue_snapshot(selected_team)
    return render_template(
        "index.html",
        dnis=dnis,
        media=media,
        range_name=range_name,
        series=series,
        metrics=metrics,
        licenses=licenses,
        queue_metrics=queue_metrics,
        today=date.today().isoformat(),
        current_month=date.today().strftime("%Y-%m"),
        current_year=date.today().year,
        teams=TEAMS,
        selected_team=selected_team,
        campaigns=CAMPAIGNS,
        supervisors=SUPERVISORS,
        profiles=PROFILES,
        updated_at=datetime.now().strftime("%H:%M:%S"),
    )


@app.route("/api/metrics")
def metrics_api():
    dnis = "582129175656"
    range_name = request.args.get("range", "today")
    if range_name not in {"today", "yesterday", "7d"}:
        return jsonify({"error": "Rango de métricas no válido"}), 400
    try:
        selected_team = normalize_team(request.args.get("team", "all"))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    series = generate_series_data(range_name, dnis, selected_team)
    metrics = build_metrics(series)
    queue_metrics = build_queue_snapshot(selected_team)
    licenses = build_license_snapshot(selected_team)
    return jsonify({
        "series": series,
        "metrics": metrics,
        "queue_metrics": queue_metrics,
        "licenses": licenses,
        "team": selected_team,
        "updated_at": datetime.now().strftime("%H:%M:%S"),
    })


@app.route("/api/license-monitoring")
def license_monitoring_api():
    try:
        selected_team = normalize_team(request.args.get("team", "all"))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    snapshot = build_monitor_snapshot(selected_team)
    for key in ("online", "offline"):
        snapshot[f"{key}_duration"] = format_duration(sum(
            agent["status_seconds"] for agent in snapshot["agents"]
            if agent["connection"] == ("Online" if key == "online" else "Offline")
        ))
    snapshot["agents"] = [serialize_agent_record(agent) for agent in snapshot["agents"]]
    return jsonify(snapshot)


@app.route("/api/license-report")
def license_report_api():
    try:
        records = filtered_agent_records(request.args)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    return jsonify({"count": len(records), "rows": [serialize_agent_record(record) for record in records]})


@app.route("/reports/licenses.csv")
def export_license_report():
    try:
        records = filtered_agent_records(request.args)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    fields = [
        ("Usuario", "user"), ("Fecha login", "login_date"), ("Hora login", "login_at"),
        ("Hora logout", "logout_at"), ("Conexión", "connection"), ("Tiempo sesión", "connection_seconds"),
        ("Tiempo en estado", "status_seconds"),
        ("Cola", "queue_state"), ("Cola activa", "queue_active"), ("Disponible", "available_seconds"),
        ("En interacción", "interaction_seconds"), ("Gestión posterior", "acw_seconds"),
        ("Pausa", "pause_seconds"), ("Ocupación %", "occupancy"), ("Licencia activa", "license_active"),
        ("Tipo licencia", "license_type"), ("Equipo", "team"), ("Campaña", "campaign"),
        ("Supervisor", "supervisor"), ("Perfil", "profile"), ("Organización", "organization"),
    ]
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow([label for label, _ in fields])
    for record in records:
        row = []
        for _, key in fields:
            value = record[key]
            if key.endswith("_seconds"):
                value = format_duration(value)
            row.append(value)
        writer.writerow(row)
    filename = f"reporte_licencias_{date.today().isoformat()}.csv"
    return Response(
        "\ufeff" + output.getvalue(),
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.route("/api/management")
def management_api():
    period = request.args.get("period", "interval")
    try:
        selected_team = normalize_team(request.args.get("team", "all"))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    today = date.today()
    default_values = {
        "interval": today.isoformat(),
        "date": today.isoformat(),
        "month": today.strftime("%Y-%m"),
        "year": str(today.year),
    }
    selected_value = request.args.get("value", default_values.get(period, today.isoformat()))
    try:
        report = build_management_report(period, selected_value, selected_team)
    except (ValueError, TypeError):
        return jsonify({"error": "Valor de periodo invalido"}), 400
    return jsonify(report)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
