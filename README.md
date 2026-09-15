# IST Timetable

Files:
- index.html, style.css, app.js : the app
- sw.js : makes it work offline
- manifest.json, icons/ : lets people install it to their home screen
- parse_timetable.py : turns the Excel file into timetable.json
- .github/workflows/update-timetable.yml : the live sync robot

Run locally:
    pip install openpyxl
    python parse_timetable.py CS_Timetable_Fall_2026-V2.2.xlsx timetable.json
    python -m http.server 8000     # then open http://localhost:8000

The parser prints WARNING lines when a class sheet and a room sheet disagree.
