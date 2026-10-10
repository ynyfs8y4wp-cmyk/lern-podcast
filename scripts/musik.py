"""Erzeugt einmalig die Musik der Hörspielwerkstatt (ElevenLabs Music) und prüft, welche Sprachmodelle das Konto nutzen darf.

Ergebnis: musik/intro.mp3 (Erkennungsmelodie), musik/outro.mp3 (Abschied), musik/bett.mp3 (leiser Musikteppich),
musik/modelle.json (welche Modelle für Text-to-Dialogue und Musik funktionieren).
Vorhandene Musik bleibt, außer NEU=1.
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
OUT = ROOT / "musik"
KEY = os.environ.get("ELEVENLABS_API_KEY", "").strip()
NEU = os.environ.get("NEU") == "1"

STUECKE = {
    "intro": (9000, "Warm, gentle opening jingle for a German children's audio drama. Music box, glockenspiel, soft ukulele "
                     "and pizzicato strings, cozy and magical, bright major key, friendly and inviting, short and simple melody, "
                     "ends softly so a storyteller can start speaking. Instrumental only."),
    "outro": (12000, "Soft, tender closing theme for a children's bedtime audio story. Music box and warm strings, the same cozy "
                      "magical feeling, calm lullaby character, slowly fading out at the end. Instrumental only."),
    "bett": (60000, "Very soft, sparse ambient background music for a children's audio story, to play quietly under a narrator. "
                     "Gentle harp, light felt piano and warm pads, slow, calm, no drums, no prominent melody, no sudden changes, "
                     "seamless and loopable. Instrumental only."),
}


def post(url: str, body: dict, ziel: Path) -> int:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"xi-api-key": KEY, "Content-Type": "application/json", "Accept": "audio/mpeg"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            ziel.write_bytes(r.read())
            return r.status
    except urllib.error.HTTPError as exc:
        print(f"::warning::{url.split('/v1/')[1]} {body.get('model_id')}: {exc.code} {exc.read()[:200]!r}")
        return exc.code


def main() -> int:
    if not KEY:
        print("::error::ELEVENLABS_API_KEY fehlt")
        return 1
    OUT.mkdir(exist_ok=True)
    ergebnis: dict = {"dialog": {}, "musik": {}}
    probe = [{"text": "[warmly] Es war einmal ein kleiner Pinguin.", "voice_id": "JBFqnCBsd6RMkjVDRZzb"},
             {"text": "[excited] Ich bin Pip! [giggles] Und ich traue mich heute ins Wasser!", "voice_id": "FGY2WhTYpPnrIDTdsKH5"}]
    for modell in ("eleven_v4", "eleven_v3"):
        ziel = OUT / f"probe-{modell}.mp3"
        ergebnis["dialog"][modell] = post("https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128",
                                          {"inputs": probe, "model_id": modell, "language_code": "de"}, ziel)
    for name, (ms, prompt) in STUECKE.items():
        ziel = OUT / f"{name}.mp3"
        if ziel.exists() and not NEU:
            continue
        for modell in ("music_v2_5", "music_v1"):
            code = post("https://api.elevenlabs.io/v1/music",
                        {"prompt": prompt, "music_length_ms": ms, "model_id": modell, "force_instrumental": True}, ziel)
            ergebnis["musik"][f"{name}:{modell}"] = code
            if code == 200:
                roh = ziel.with_suffix(".roh.mp3"); ziel.rename(roh)
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(roh), "-ac", "2", "-ar", "44100", "-b:a", "160k",
                                "-af", "loudnorm=I=-20:TP=-2", str(ziel)], check=True)
                roh.unlink()
                break
    (OUT / "modelle.json").write_text(json.dumps(ergebnis, indent=1), encoding="utf-8")
    print(json.dumps(ergebnis))
    return 0


if __name__ == "__main__":
    sys.exit(main())
