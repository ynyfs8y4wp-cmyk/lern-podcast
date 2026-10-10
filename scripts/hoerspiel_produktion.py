"""Hörspiel-Produktion: aus dem Rollenskript ein Kinderhörspiel mit Atmosphäre machen.

Statt jede Zeile einzeln einzusprechen und hart aneinanderzuschneiden:
1. Szenen am Stück: Aufeinanderfolgende Sprechzeilen gehen gemeinsam an ElevenLabs Text-to-Dialogue
   (eleven_v4, sonst eleven_v3). So entstehen natürliche Wechsel, Pausen und Betonung zwischen den Figuren.
   Audio-Tags im Skript wie [giggles], [whispers], [excited] steuern den Vortrag.
2. Geräusche überlappen weich mit den Sätzen davor und danach.
3. Erkennungsmelodie am Anfang, Abschiedsmusik am Ende und ein sehr leiser Musikteppich, der unter Sprache
   automatisch leiser wird (Sidechain).
4. Lautheit angleichen, MP3 für den Feed und M4A für den Player in der App.

Fällt das Dialog-Modell aus, spricht das klassische Modell Zeile für Zeile (ohne Tags) – das Hörspiel entsteht trotzdem.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

DIALOG_MODELLE = [m.strip() for m in (os.environ.get("HOERSPIEL_DIALOG_MODELLE") or "eleven_v4,eleven_v3").split(",") if m.strip()]
MUSIK_AN = (os.environ.get("HOERSPIEL_MUSIK") or "an").strip().lower() not in ("aus", "off", "0", "false", "nein")
BETT_LAUTSTAERKE = float(os.environ.get("HOERSPIEL_BETT") or "0.16")
MAX_ZEICHEN = 1800          # Text-to-Dialogue: zuverlässig bis etwa 2000 Zeichen je Anfrage
MAX_STIMMEN = 10
PAUSE_SZENE = 0.55          # Pause zwischen zwei Szenenblöcken
TAG = re.compile(r"\[([A-Za-z][A-Za-z ,'\-]{1,38})\]")


def text_mit_tags(roh: str) -> str:
    """Behält englische Audio-Tags wie [giggles], entfernt alles andere, was nicht gesprochen werden soll."""
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", roh)                    # Markdown-Links
    tags: list[str] = []
    t = TAG.sub(lambda m: tags.append(m.group(1).strip().lower()) or f"\u0000{len(tags) - 1}\u0000", t)
    t = re.sub(r"\[[^\]]*\]|\([^)]*\)", "", t)                            # andere Regieanweisungen
    t = re.sub(r"https?://\S+|[*_`#>|]", "", t)
    t = re.sub(r"\u0000(\d+)\u0000", lambda m: f"[{tags[int(m.group(1))]}]", t)
    t = re.sub(r"\s+", " ", t).strip()
    return re.sub(r"\s+([.,!?;:…])", r"\1", t)


def ohne_tags(text: str) -> str:
    return re.sub(r"\s+([.,!?;:…])", r"\1", re.sub(r"\s+", " ", TAG.sub("", text)).strip())


def _post(url: str, key: str, body: dict, ziel: Path) -> None:
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), method="POST",
                                 headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"})
    with urllib.request.urlopen(req, timeout=300) as r:
        ziel.write_bytes(r.read())


def dauer(datei: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(datei)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip() or 0)


def bloecke(turns: list[tuple[str, str]], stimme_fuer) -> list[tuple[str, object]]:
    """Teilt das Skript in Szenenblöcke (gemeinsam eingesprochen) und Geräusche."""
    out: list[tuple[str, object]] = []
    akt: list[tuple[str, str, str]] = []
    zeichen = 0
    for wer, text in turns:
        if wer == "GERÄUSCH":
            if akt:
                out.append(("sprache", akt)); akt, zeichen = [], 0
            out.append(("geraeusch", text))
            continue
        stimme = stimme_fuer(wer)
        stimmen = {s for _, _, s in akt} | {stimme}
        if akt and (zeichen + len(text) > MAX_ZEICHEN or len(stimmen) > MAX_STIMMEN):
            out.append(("sprache", akt)); akt, zeichen = [], 0
        akt.append((wer, text, stimme))
        zeichen += len(text)
    if akt:
        out.append(("sprache", akt))
    return out


class Produktion:
    def __init__(self, key: str, work: Path, ep_id: str, sprache: str, einzeln, geraeusch, musik_ordner: Path):
        self.key, self.work, self.ep_id, self.sprache = key, work, ep_id, sprache
        self.einzeln = einzeln            # Fallback: (text, voice_id, vorher, nachher, ziel) -> None
        self.geraeusch = geraeusch        # (beschreibung, ziel) -> bool
        self.musik = musik_ordner
        self.modell: str | None = None    # das erste Dialog-Modell, das funktioniert
        self.modelle = list(DIALOG_MODELLE)
        self.bericht = {"dialog_bloecke": 0, "einzeln_bloecke": 0, "geraeusche": 0, "modell": None, "musik": False}

    def _dialog(self, block: list[tuple[str, str, str]], ziel: Path) -> bool:
        inputs = [{"text": text, "voice_id": stimme} for _, text, stimme in block]
        while self.modelle:
            modell = self.modell or self.modelle[0]
            try:
                _post("https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128", self.key,
                      {"inputs": inputs, "model_id": modell, "language_code": self.sprache}, ziel)
                self.modell = modell
                return ziel.exists() and ziel.stat().st_size > 2000
            except urllib.error.HTTPError as exc:
                text = exc.read()[:200]
                print(f"::warning::Dialog-Modell {modell} nicht nutzbar ({exc.code}): {text!r}")
                if exc.code in (400, 401, 403, 404, 422) and modell in self.modelle:
                    self.modelle.remove(modell); self.modell = None   # nächstes Modell probieren
                    continue
                return False
            except Exception as exc:  # noqa: BLE001
                print(f"::warning::Dialog-Anfrage fehlgeschlagen: {exc}")
                return False
        return False

    def _einzeln(self, block: list[tuple[str, str, str]], ziel: Path) -> None:
        teile = []
        for n, (_, text, stimme) in enumerate(block):
            t = ohne_tags(text)
            if not t:
                continue
            p = self.work / f"{self.ep_id}_e{id(block)}_{n:03d}.mp3"
            vorher = ohne_tags(block[n - 1][1]) if n else ""
            nachher = ohne_tags(block[n + 1][1]) if n + 1 < len(block) else ""
            self.einzeln(t, stimme, vorher, nachher, p)
            teile.append(p)
        args = ["ffmpeg", "-y", "-loglevel", "error"]
        for p in teile:
            args += ["-i", str(p)]
        kette = "".join(f"[{i}:a]aresample=44100,aformat=channel_layouts=mono,apad=pad_dur=0.32[a{i}];" for i in range(len(teile)))
        kette += "".join(f"[a{i}]" for i in range(len(teile))) + f"concat=n={len(teile)}:v=0:a=1[out]"
        subprocess.run([*args, "-filter_complex", kette, "-map", "[out]", str(ziel)], check=True)

    def erzeugen(self, turns: list[tuple[str, str]], stimme_fuer, sfx_an: bool, sfx_max: int,
                 ziel_mp3: Path, ziel_m4a: Path, metadaten: list[str]) -> dict:
        segmente: list[tuple[str, Path]] = []
        sfx = 0
        for n, (art, inhalt) in enumerate(bloecke(turns, stimme_fuer)):
            datei = self.work / f"{self.ep_id}_b{n:03d}.mp3"
            if art == "geraeusch":
                prompt = str(inhalt).split("|")[-1].strip()
                if sfx_an and sfx < sfx_max and prompt and self.geraeusch(prompt, datei):
                    sfx += 1
                    segmente.append(("geraeusch", datei))
                continue
            block = inhalt  # type: ignore[assignment]
            if self.modelle and self._dialog(block, datei):
                self.bericht["dialog_bloecke"] += 1
            else:
                self._einzeln(block, datei)
                self.bericht["einzeln_bloecke"] += 1
            segmente.append(("sprache", datei))
        if not any(a == "sprache" for a, _ in segmente):
            raise RuntimeError("Keine sprechbaren Zeilen gefunden")
        self.bericht["geraeusche"] = sfx
        self.bericht["modell"] = self.modell
        self._mischen(segmente, ziel_mp3, ziel_m4a, metadaten)
        return self.bericht

    def _mischen(self, segmente: list[tuple[str, Path]], ziel_mp3: Path, ziel_m4a: Path, metadaten: list[str]) -> None:
        intro, outro, bett = (self.musik / "intro.mp3", self.musik / "outro.mp3", self.musik / "bett.mp3")
        musik = MUSIK_AN and intro.exists() and outro.exists() and bett.exists()
        self.bericht["musik"] = musik
        # Zeitleiste: Sprache beginnt, während die Erkennungsmelodie ausklingt; Geräusche überlappen weich
        t = max(0.0, dauer(intro) - 2.0) if musik else 0.4
        start_sprache = t
        plan: list[tuple[str, Path, float, float]] = []   # art, datei, start, dauer
        for n, (art, datei) in enumerate(segmente):
            d = dauer(datei)
            if art == "geraeusch":
                s = max(start_sprache, t - 0.45)
                plan.append((art, datei, s, d))
                t = s + d - 0.3
            else:
                plan.append((art, datei, t, d))
                t += d + PAUSE_SZENE
        ende_sprache = t
        args = ["ffmpeg", "-y", "-loglevel", "error"]
        for _, datei, _, _ in plan:
            args += ["-i", str(datei)]
        k = ""
        sprach, geraeusch = [], []
        for i, (art, _, s, d) in enumerate(plan):
            ms = int(s * 1000)
            if art == "geraeusch":
                k += (f"[{i}:a]aresample=44100,aformat=channel_layouts=stereo,volume=0.42,"
                      f"afade=t=in:d=0.5,afade=t=out:st={max(0.0, d - 0.9):.2f}:d=0.9,adelay={ms}|{ms}[g{i}];")
                geraeusch.append(f"[g{i}]")
            else:
                k += f"[{i}:a]aresample=44100,aformat=channel_layouts=stereo,adelay={ms}|{ms}[s{i}];"
                sprach.append(f"[s{i}]")
        k += "".join(sprach) + f"amix=inputs={len(sprach)}:normalize=0:dropout_transition=0[sp];"
        busse = ["[spo]"]
        if geraeusch:
            k += "".join(geraeusch) + f"amix=inputs={len(geraeusch)}:normalize=0:dropout_transition=0[gr];"
            busse.append("[gr]")
        if musik:
            n0 = len(plan)
            args += ["-i", str(intro), "-i", str(outro), "-stream_loop", "-1", "-i", str(bett)]
            bett_start, bett_ende = start_sprache - 0.5, ende_sprache + 0.8
            bett_dauer = bett_ende - bett_start
            outro_start = ende_sprache + 0.2
            k += "[sp]asplit=2[spo][sc];"
            k += (f"[{n0 + 2}:a]aresample=44100,aformat=channel_layouts=stereo,atrim=0:{bett_dauer:.2f},asetpts=PTS-STARTPTS,"
                  f"volume={BETT_LAUTSTAERKE},afade=t=in:d=2.5,afade=t=out:st={max(0.0, bett_dauer - 3):.2f}:d=3,"
                  f"adelay={int(bett_start * 1000)}|{int(bett_start * 1000)}[bt];")
            k += "[bt][sc]sidechaincompress=threshold=0.02:ratio=5:attack=40:release=600:makeup=1[btd];"
            di = dauer(intro)
            k += (f"[{n0}:a]aresample=44100,aformat=channel_layouts=stereo,volume=0.8,"
                  f"afade=t=out:st={max(0.0, di - 2.5):.2f}:d=2.5[in];")
            ms = int(outro_start * 1000)
            k += f"[{n0 + 1}:a]aresample=44100,aformat=channel_layouts=stereo,volume=0.8,adelay={ms}|{ms}[out_m];"
            busse += ["[btd]", "[in]", "[out_m]"]
        else:
            k += "[sp]anull[spo];"
        k += "".join(busse) + f"amix=inputs={len(busse)}:normalize=0:dropout_transition=0,loudnorm=I=-18:TP=-1.5:LRA=11[mix]"
        args += ["-filter_complex", k, "-map", "[mix]", "-ar", "44100", "-ac", "2", "-b:a", "128k", *metadaten, str(ziel_mp3)]
        subprocess.run(args, check=True)
        # Für den Player in der App: AAC im MP4-Container
        # Fassung für den Player der App: AAC mit winziger Standbild-Videospur, weil der Speicher der App nur Videodateien annimmt.
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0xFFF4E0:s=16x16:r=1", "-i", str(ziel_mp3),
                        "-map", "0:v", "-map", "1:a", "-shortest", "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p",
                        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", "-map_metadata", "1", "-f", "mp4", str(ziel_m4a)], check=True)
