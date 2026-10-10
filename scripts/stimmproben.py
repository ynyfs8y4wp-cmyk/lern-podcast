"""Erzeugt kurze Hörproben aller Stimmen aus stimmen/katalog.json in vier Sprachen.

Ergebnis: stimmen/proben/<sprache>/<key>.mp3 (mono, 64 kbit/s, ca. 4 Sekunden).
Vorhandene Proben werden übersprungen, außer NEU=1 ist gesetzt.
Stimmen, die ElevenLabs ablehnt, landen in stimmen/proben/fehler.json.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KAT = json.loads((ROOT / "stimmen" / "katalog.json").read_text(encoding="utf-8"))
OUT = ROOT / "stimmen" / "proben"
KEY = os.environ.get("ELEVENLABS_API_KEY", "").strip()
MODEL = os.environ.get("HOERSPIEL_MODEL") or "eleven_multilingual_v2"
NEU = os.environ.get("NEU") == "1"


def tts(text: str, voice: str, out: Path) -> None:
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128",
        data=json.dumps({"text": text, "model_id": MODEL,
                         "voice_settings": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.3}}).encode(),
        headers={"xi-api-key": KEY, "Content-Type": "application/json", "Accept": "audio/mpeg"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read()
    tmp = out.with_suffix(".roh.mp3")
    tmp.write_bytes(raw)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp), "-ac", "1", "-b:a", "64k",
                    "-af", "loudnorm=I=-18:TP=-2", str(out)], check=True)
    tmp.unlink()


def main() -> int:
    if not KEY:
        print("::error::ELEVENLABS_API_KEY fehlt")
        return 1
    fehler: dict[str, str] = {}
    for lang, satz in KAT["probe"].items():
        (OUT / lang).mkdir(parents=True, exist_ok=True)
        for v in KAT["stimmen"]:
            ziel = OUT / lang / f"{v['key']}.mp3"
            if ziel.exists() and not NEU:
                continue
            try:
                tts(satz.replace("{n}", v["name"]), v["id"], ziel)
                print(f"ok {lang}/{v['key']}")
            except (urllib.error.HTTPError, urllib.error.URLError, subprocess.CalledProcessError) as exc:
                fehler[v["key"]] = str(exc)
                print(f"::warning::{lang}/{v['key']}: {exc}")
    (OUT / "fehler.json").write_text(json.dumps(fehler, indent=1), encoding="utf-8")
    try:  # Überblick, welche Stimmen das Konto kennt (nur Name, ID und Merkmale)
        req = urllib.request.Request("https://api.elevenlabs.io/v1/voices", headers={"xi-api-key": KEY})
        with urllib.request.urlopen(req, timeout=60) as r:
            daten = json.load(r)
        liste = [{"id": v.get("voice_id"), "name": v.get("name"), "kategorie": v.get("category"),
                  "merkmale": v.get("labels") or {}} for v in daten.get("voices", [])]
        (OUT / "verfuegbar.json").write_text(json.dumps(liste, indent=1, ensure_ascii=False), encoding="utf-8")
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError) as exc:
        print(f"::warning::Stimmenliste nicht abrufbar: {exc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
