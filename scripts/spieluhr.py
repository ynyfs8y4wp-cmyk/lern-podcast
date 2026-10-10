"""Erzeugt die Hörspielmusik ohne KI-Dienst: eine eigene, kurze Spieluhr-Melodie (Intro, Outro) und einen sehr leisen
Klangteppich aus weichen Akkorden. Wird genutzt, solange der ElevenLabs-Schlüssel keine Musik erzeugen darf.

Aufruf:  python scripts/spieluhr.py   (schreibt musik/intro.mp3, musik/outro.mp3, musik/bett.mp3)
"""
from __future__ import annotations

import subprocess
import wave
from pathlib import Path

import numpy as np

SR = 44100
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "musik"
NOTEN = {"A3": 220.0, "B3": 246.94, "C4": 261.63, "D4": 293.66, "E4": 329.63, "F4": 349.23, "G4": 392.0, "A4": 440.0, "B4": 493.88,
         "C5": 523.25, "D5": 587.33, "E5": 659.25, "F5": 698.46, "G5": 783.99, "A5": 880.0, "B5": 987.77, "C6": 1046.5}


def spieluhr_ton(f: float, dauer: float) -> np.ndarray:
    """Spieluhr-Klang: Grundton plus leicht verstimmte Obertöne, schneller Anschlag, langes Ausklingen."""
    t = np.arange(int(SR * dauer)) / SR
    huelle = np.exp(-t * 3.2) * (1 - np.exp(-t * 400))
    klang = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t * 6)
             + 0.18 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t * 9) + 0.08 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 14))
    return klang * huelle


def melodie(noten: list[tuple[str, float]], schlag: float, nachklang: float = 2.5, begleitung: list[tuple[str, float]] | None = None) -> np.ndarray:
    laenge = sum(d for _, d in noten) * schlag + nachklang
    spur = np.zeros(int(SR * laenge) + SR)
    pos = 0.0
    for n, d in noten:
        if n != "-":
            ton = spieluhr_ton(NOTEN[n], d * schlag + 1.6)
            i = int(pos * SR)
            spur[i:i + len(ton)] += ton[: len(spur) - i]
        pos += d * schlag
    if begleitung:
        pos = 0.0
        for n, d in begleitung:
            if n != "-":
                ton = 0.45 * spieluhr_ton(NOTEN[n], d * schlag + 1.6)
                i = int(pos * SR)
                spur[i:i + len(ton)] += ton[: len(spur) - i]
            pos += d * schlag
    return spur


def teppich(akkorde: list[list[str]], je: float) -> np.ndarray:
    """Sehr weicher Klangteppich: Akkorde mit langsamem Ein- und Ausblenden, leichte Schwebung."""
    teile = []
    for akk in akkorde:
        t = np.arange(int(SR * je)) / SR
        huelle = np.minimum(1, t / 1.8) * np.minimum(1, (je - t) / 1.8)
        s = sum(np.sin(2 * np.pi * NOTEN[n] * t) * 0.5 + np.sin(2 * np.pi * NOTEN[n] * 1.003 * t) * 0.5
                + 0.12 * np.sin(2 * np.pi * NOTEN[n] * 2 * t) for n in akk)
        teile.append(s * huelle * (1 + 0.08 * np.sin(2 * np.pi * 0.25 * t)))
    # Akkorde überlappend aneinanderlegen
    ueber = int(SR * 1.8)
    spur = teile[0]
    for x in teile[1:]:
        spur = np.concatenate([spur[:-ueber], spur[-ueber:] + x[:ueber], x[ueber:]])
    return spur


def schreiben(signal: np.ndarray, name: str, hall: bool = True) -> None:
    signal = signal / (np.max(np.abs(signal)) + 1e-9) * 0.8
    wav = OUT / f"{name}.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((signal * 32767).astype(np.int16).tobytes())
    filt = "aecho=0.8:0.6:60|130:0.30|0.18," if hall else ""
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-af",
                    f"{filt}lowpass=f=7000,highpass=f=90,aformat=channel_layouts=stereo,loudnorm=I=-20:TP=-2", "-ar", "44100",
                    "-b:a", "160k", str(OUT / f"{name}.mp3")], check=True)
    wav.unlink()


def main() -> None:
    OUT.mkdir(exist_ok=True)
    intro = [("C5", 1), ("E5", 1), ("G5", 1), ("E5", 1), ("F5", 1), ("A5", 1), ("G5", 2),
             ("E5", 1), ("G5", 1), ("C6", 1), ("B5", 1), ("A5", 1), ("G5", 1), ("C5", 3)]
    intro_bass = [("C4", 4), ("F4", 2), ("G4", 2), ("A3", 2), ("F4", 2), ("C4", 3)]
    outro = [("G5", 1.5), ("E5", 0.5), ("D5", 1), ("C5", 1), ("A4", 1), ("C5", 1), ("D5", 1), ("E5", 1),
             ("D5", 1.5), ("C5", 0.5), ("B4", 1), ("D5", 1), ("C5", 4)]
    outro_bass = [("C4", 4), ("F4", 4), ("G4", 4), ("C4", 4)]
    schreiben(melodie(intro, 0.36, 2.2, intro_bass), "intro")
    schreiben(melodie(outro, 0.5, 3.0, outro_bass), "outro")
    akk = [["C4", "E4", "G4"], ["A3", "C4", "E4"], ["F4", "A4", "C5"], ["G4", "B4", "D5"]]
    schreiben(teppich(akk * 3, 7.0), "bett", hall=False)


if __name__ == "__main__":
    main()
