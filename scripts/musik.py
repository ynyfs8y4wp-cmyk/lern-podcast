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


SFX_PROMPTS = {
    "intro": "Gentle cheerful music box and glockenspiel melody, cozy magical children's story opening jingle, warm, soft ukulele, major key",
    "outro": "Soft tender music box lullaby melody with warm strings, calm children's bedtime story ending, slowly fading out",
    "bett": "Very soft calm ambient harp and felt piano background music, gentle and sparse, peaceful children's bedtime atmosphere, no drums",
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


def ffdauer(datei: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(datei)],
                         capture_output=True, text=True).stdout
    return float(out.strip() or 0)


def main() -> int:
    if not KEY:
        print("::error::ELEVENLABS_API_KEY fehlt")
        return 1
    OUT.mkdir(exist_ok=True)
    ergebnis: dict = {"dialog": {}, "musik": {}}
    probe = [{"text": "[warmly] Es war einmal ein kleiner Pinguin.", "voice_id": "JBFqnCBsd6RMkjVDRZzb"},
             {"text": "[excited] Ich bin Pip! [giggles] Und ich traue mich heute ins Wasser!", "voice_id": "FGY2WhTYpPnrIDTdsKH5"}]
    for modell in ([] if os.environ.get("PROBE") == "0" else ["eleven_v4", "eleven_v3"]):
        ziel = OUT / f"probe-{modell}.mp3"
        ergebnis["dialog"][modell] = post("https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128",
                                          {"inputs": probe, "model_id": modell, "language_code": "de"}, ziel)
    for name, (ms, prompt) in STUECKE.items():
        ziel = OUT / f"{name}.mp3"
        if ziel.exists() and not NEU:
            continue
        ziel.unlink(missing_ok=True)
        for modell in ("music_v2_5", "music_v1"):
            code = post("https://api.elevenlabs.io/v1/music",
                        {"prompt": prompt, "music_length_ms": ms, "model_id": modell, "force_instrumental": True}, ziel)
            ergebnis["musik"][f"{name}:{modell}"] = code
            if code == 200:
                break
        if not (ziel.exists() and ziel.stat().st_size > 2000):
            # Ohne Zugriff auf die Musik-API: kurze Musikstücke über die Geräusch-API (bis 22 Sekunden)
            code = post("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",
                        {"text": SFX_PROMPTS[name], "duration_seconds": min(22, ms / 1000), "prompt_influence": 0.7}, ziel)
            ergebnis["musik"][f"{name}:sound-generation"] = code
        if ziel.exists() and ziel.stat().st_size > 2000:
            roh = ziel.with_suffix(".roh.mp3"); ziel.rename(roh)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(roh), "-ac", "2", "-ar", "44100", "-b:a", "160k",
                            "-af", "loudnorm=I=-20:TP=-2", str(ziel)], check=True)
            roh.unlink()
            if name == "bett" and 0 < ffdauer(ziel) < 40:   # kurzes Stück: mit Überblendungen zu einem längeren Teppich verbinden
                lang = ziel.with_suffix(".lang.mp3")
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(ziel), "-i", str(ziel), "-i", str(ziel), "-filter_complex",
                                "[0:a][1:a]acrossfade=d=4:c1=tri:c2=tri[a];[a][2:a]acrossfade=d=4:c1=tri:c2=tri[b]", "-map", "[b]",
                                "-b:a", "160k", str(lang)], check=True)
                lang.replace(ziel)
    (OUT / "modelle.json").write_text(json.dumps(ergebnis, indent=1), encoding="utf-8")
    print(json.dumps(ergebnis))
    return 0


if __name__ == "__main__":
    sys.exit(main())
