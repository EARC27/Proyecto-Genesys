# Proyecto Genesys

Dashboard de monitoreo para operaciones en tiempo real con Genesys, ahora implementado en Python con Flask.

## Requisitos

- Python 3.10+
- pip

## Instalación

Linux/macOS:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Windows PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Ejecutar la app

```bash
python app.py
```

La aplicación quedará disponible en `http://localhost:5000`.

## Estructura principal

- `app.py`: aplicación Flask
- `templates/index.html`: vista principal
- `static/css/style.css`: estilos
- `static/js/app.js`: comportamiento interactivo
- `requirements.txt`: dependencias
