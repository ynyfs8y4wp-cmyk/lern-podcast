"""Podcast-Werkstatt: spricht neue Folgen ein und baut die Podcast-Feeds.

Zwei Sendungen teilen sich diese Pipeline:

* Lernroute Agentifizierung  – Ordner episodes/   → site/feed.xml
* Hörspielwerkstatt          – Ordner hoerspiele/ → site/hoerspiele/feed.xml

Ablauf je Sendung:
1. Jede Datei <ordner>/<id>.md ist eine Folge.
2. Fehlt dazu <ordner>/<id>.json, ist die Folge neu: Text aufbereiten,
   einsprechen (ElevenLabs, sonst Piper), zu MP3 wandeln und als
   GitHub-Release-Datei ablegen. Größe, Dauer und Link landen in <id>.json.
3. Aus allen Folgen entstehen Feed und Übersichtsseite auf GitHub Pages.

Hörspiele bestehen aus Zeilen wie "ERZÄHLER: ...", "LOTTA: ...", "MAMA: ..."
und "GERÄUSCH: <englische Beschreibung>". Jede Rolle hat eine eigene Stimme,
Geräusche erzeugt ElevenLabs als kurze Soundeffekte; steht dort
"deutsche Beschreibung | english prompt", dient der englische Teil als Prompt.
"""

from __future__ import annotations

import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys
import wave
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import hoerspiel_produktion as hp  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
VOICE_DIR = ROOT / "voice"

REPO = os.environ.get("GITHUB_REPOSITORY", "owner/lern-podcast")
OWNER, REPO_NAME = REPO.split("/", 1)
BASE_URL = os.environ.get("PODCAST_BASE_URL", f"https://{OWNER.lower()}.github.io/{REPO_NAME}")
VOICE = os.environ.get("PIPER_VOICE", "de_DE-thorsten-high")

ELEVEN_KEY = os.environ.get("ELEVENLABS_API_KEY", "").strip()
ELEVEN_MODEL = os.environ.get("ELEVEN_MODEL") or "eleven_multilingual_v2"
HOERSPIEL_MODEL = os.environ.get("HOERSPIEL_MODEL") or ELEVEN_MODEL
SFX_ON = (os.environ.get("HOERSPIEL_SFX") or "an").strip().lower() not in ("aus", "off", "0", "false", "nein")
SFX_MAX = 6
# Schlüssel der Hörspiele und daraus abgeleiteter, nicht erratbarer Feed-Pfad (siehe Verschlüsselung unten)
GEHEIMNIS = os.environ.get("HOERSPIEL_GEHEIMNIS", "").strip()
HS_PFAD = ("h-" + hashlib.sha256(("pfad:" + GEHEIMNIS).encode()).hexdigest()[:32]) if GEHEIMNIS else ""

# Stimmen der Lern-Sendung (zwei Moderatoren)
HOSTS = {
    "ANNA": os.environ.get("ELEVEN_VOICE_ANNA") or "EXAVITQu4vr4xnSDxMaL",
    "BEN": os.environ.get("ELEVEN_VOICE_BEN") or "JBFqnCBsd6RMkjVDRZzb",
}

# Stimmen der Hörspiele: Voice-IDs aus der ElevenLabs-Bibliothek.
# Überschreiben mit der Repository-Variable HOERSPIEL_VOICES, z. B.
# {"LOTTA": "<voice-id>", "ERZÄHLER": "<voice-id>"}
ROLE_VOICES = {
    "ERZÄHLER": "JBFqnCBsd6RMkjVDRZzb",   # warmer Geschichtenerzähler
    "LOTTA": "cgSgspJ2msm6clMCkdW9",      # verspielt, hell
    "FINN": "IKne3meq5aSn9XLyUdCD",       # jung, quirlig
    "PIP": "FGY2WhTYpPnrIDTdsKH5",        # neugierig, ein bisschen schüchtern
    "BRUNO": "bIHbv24MWmeRgasZH58o",      # freundlich, gemütlich
    "MIRA": "EXAVITQu4vr4xnSDxMaL",       # kleine Prinzessin und Zauberin, jung und sanft
    "MAMA": "21m00Tcm4TlvDq8ikWAM",
    "PAPA": "iP95p4xoKVk53GoZ742B",
    "OMA": "XrExE9yKIg1WjnnlVkGX",
    "OPA": "pqHfZKP75CvOlQylNhV4",
    "FRAU": "9BWtsMINqrJLrRacOk9x",       # weitere Erwachsene: Erzieherin, Schwimmlehrerin, Ärztin
    "MANN": "cjVigY5qzO86Huf0OWal",       # weitere Erwachsene: Bademeister, Arzt, Busfahrer
    "KIND": "TX3LPaxmHKxFdv7VOQHJ",       # andere Kinder
}
try:
    ROLE_VOICES.update({k.upper(): v for k, v in json.loads(os.environ.get("HOERSPIEL_VOICES") or "{}").items() if v})
except ValueError:
    print("::warning::HOERSPIEL_VOICES ist kein gültiges JSON und wird ignoriert.")
# Stimmenkatalog: Kurznamen ("george") oder Voice-IDs, je Hörspiel wählbar über die Kopfzeile
# stimmen: {"ERZÄHLER": "george", "FUNKEL": "laura"}
try:
    KATALOG = json.loads((ROOT / "stimmen" / "katalog.json").read_text(encoding="utf-8"))
except (OSError, ValueError):
    KATALOG = {"stimmen": []}
VOICE_KEYS = {v["key"]: v["id"] for v in KATALOG.get("stimmen", [])}


def voice_id(wert: str) -> str:
    """Kurzname aus dem Katalog oder direkt eine ElevenLabs-Voice-ID."""
    wert = str(wert or "").strip()
    return VOICE_KEYS.get(wert.lower(), wert)


ALIASES = {"ERZAEHLER": "ERZÄHLER", "ERZÄHLERIN": "ERZÄHLER", "GERAEUSCH": "GERÄUSCH", "SOUND": "GERÄUSCH"}

LINE = re.compile(r"^\s*\**([^\W\d_]+)\**\s*:\s*(.+)$")   # Rollen: nur Buchstaben, auch Á, É, Ñ


@dataclass
class Show:
    key: str
    src: Path
    out: Path
    base: str
    title: str
    description: str
    cover: str
    tag_prefix: str
    default_kind: str
    category: str
    voices: dict = field(default_factory=dict)
    roles_any: bool = False      # True: jede Rolle erlaubt, unbekannte spricht der Erzähler
    model: str = ELEVEN_MODEL
    voice_settings: dict = field(default_factory=dict)
    pause: float = 0.25
    verschluesselt: bool = False   # Skripte und Audio nur verschlüsselt im Repository


SHOWS = [
    Show(
        key="lern",
        src=ROOT / "episodes",
        out=SITE,
        base=BASE_URL,
        title=os.environ.get("PODCAST_TITLE", "Lernroute Agentifizierung"),
        description=("Private Lernfolgen zu KI-Agenten, Softwareentwicklung und Agentifizierung "
                     "im indirekten Bereich, einfach erklärt. Dazu der wöchentliche Markt-Radar."),
        cover="cover.png",
        tag_prefix="ep-",
        default_kind="Lernschnipsel",
        category='<itunes:category text="Technology"/>',
        voices=HOSTS,
        voice_settings={"stability": 0.4, "similarity_boost": 0.8, "style": 0.35, "use_speaker_boost": True},
    ),
    Show(
        key="hoerspiele",
        src=ROOT / "hoerspiele",
        out=SITE / (HS_PFAD or "_gesperrt"),
        base=f"{BASE_URL}/{HS_PFAD}",
        title=os.environ.get("HOERSPIEL_TITLE", "Hörspielwerkstatt"),
        description=("Persönliche Mutmach-Hörspiele für Kinder: Lotta, Finn, Pip, Bruno und Prinzessin Mira erleben "
                     "Kita-Start, Schwimmkurs, Abschiede und große Gefühle."),
        cover="cover-hoerspiele.png",
        tag_prefix="hs-",
        default_kind="Hörspiel",
        category='<itunes:category text="Kids &amp; Family"><itunes:category text="Stories for Kids"/></itunes:category>',
        voices=ROLE_VOICES,
        roles_any=True,
        model=HOERSPIEL_MODEL,
        voice_settings={"stability": 0.35, "similarity_boost": 0.75, "style": 0.5, "use_speaker_boost": True},
        pause=0.35,
        verschluesselt=True,
    ),
]


# ---------- Verschlüsselung der Hörspiele ----------
# Das Repository ist öffentlich. Skripte (hoerspiele/<id>.md.enc) und Audio im Release-Speicher (<id>.mp3.enc)
# liegen deshalb nur verschlüsselt vor (AES-256, openssl, PBKDF2). Der Schlüssel steht im Repository-Secret
# HOERSPIEL_GEHEIMNIS. Aus ihm wird auch der nicht erratbare Pfad des Feeds abgeleitet. Ohne Secret wird
# nichts veröffentlicht.
OPENSSL = ["openssl", "enc", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-salt", "-pass", "env:HOERSPIEL_GEHEIMNIS"]


def entschluesseln_text(path: Path) -> str:
    r = subprocess.run([*OPENSSL, "-d", "-a", "-A", "-in", str(path)], capture_output=True, check=True)
    return r.stdout.decode("utf-8")


def verschluesseln_datei(quelle: Path, ziel: Path) -> None:
    subprocess.run([*OPENSSL, "-in", str(quelle), "-out", str(ziel)], check=True)


def entschluesseln_datei(quelle: Path, ziel: Path) -> None:
    subprocess.run([*OPENSSL, "-d", "-in", str(quelle), "-out", str(ziel)], check=True)


# ---------- Folgen lesen ----------

def parse_episode(path: Path, show: Show) -> dict:
    """Liest Kopfdaten (zwischen ---) und Text einer Folge."""
    raw = entschluesseln_text(path) if path.name.endswith(".enc") else path.read_text(encoding="utf-8")
    meta: dict = {}
    body = raw
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", raw, re.S)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip().strip('"').strip("'")
        body = m.group(2)
    meta.setdefault("title", path.stem)
    meta.setdefault("kind", show.default_kind)
    meta.setdefault("date", datetime.now(timezone.utc).isoformat())
    meta["id"] = path.name.removesuffix(".enc").removesuffix(".md")
    meta["body"] = body.strip()
    stimmen: dict = {}
    if meta.get("stimmen"):
        try:
            roh = json.loads(meta["stimmen"])
            stimmen = {ALIASES.get(k.upper(), k.upper()): voice_id(v) for k, v in roh.items()
                       if v and re.fullmatch(r"[^\W\d_]+", k) and re.fullmatch(r"[A-Za-z0-9]+", voice_id(v))}
        except (ValueError, AttributeError):
            print(f"::warning::{path.name}: Kopfzeile 'stimmen' ist kein gültiges JSON, nehme Standardstimmen.")
    meta["stimmen"] = stimmen
    # Der Fingerabdruck umfasst die Stimmwahl: neue Stimmen = neue Vertonung
    basis = meta["body"] + ("\n" + json.dumps(stimmen, sort_keys=True, ensure_ascii=False) if stimmen else "")
    meta["hash"] = hashlib.sha256(basis.encode("utf-8")).hexdigest()[:16]
    return meta


def clean_spoken(text: str) -> str:
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"\[[^\]]*\]|\([^)]*\)", "", text)        # Regieanweisungen nie vorlesen
    text = re.sub(r"https?://\S+|[*_`#>|]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def speech_text(ep: dict, show: Show) -> str:
    """Macht aus Markdown einen gut vorlesbaren Text (Piper-Fallback)."""
    t = ep["body"]
    t = re.sub(r"```.*?```", " Ein kurzes Beispiel steht im geschriebenen Text. ", t, flags=re.S)
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)
    t = re.sub(r"https?://\S+", "", t)
    t = re.sub(r"^#{1,6}\s*(.+?)\s*$", r"\1.", t, flags=re.M)
    t = re.sub(r"^\s*[-*•]\s+", "", t, flags=re.M)
    t = re.sub(r"[*_`>|]", "", t)
    t = re.sub(r"\.\.+", ".", t)
    t = re.sub(r"[ \t]+", " ", t)
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", t) if p.strip()]
    paragraphs = [re.sub(r"\s*\n\s*", " ", p) for p in paragraphs]
    intro = f"{show.title}. {ep['kind']}: {ep['title']}."
    outro = "Das war die Folge. Bis zum nächsten Mal."
    return "\n\n".join([intro, *paragraphs, outro])


def dialog_turns(ep: dict, show: Show) -> list[tuple[str, str]]:
    """Zeilen der Form 'ROLLE: Text' als Beiträge. Rolle 'GERÄUSCH' ist ein Soundeffekt."""
    turns = []
    for line in ep["body"].splitlines():
        m = LINE.match(line)
        if not m:
            continue
        role = m.group(1).upper()
        role = ALIASES.get(role, role)
        if role == "GERÄUSCH":
            if show.roles_any:
                desc = re.sub(r"[*_`#>\[\]()]", "", m.group(2)).strip()   # "|" trennt Beschreibung und englischen Prompt
                if desc:
                    turns.append((role, desc))
            continue
        if role not in show.voices and role not in (ep.get("stimmen") or {}) and not show.roles_any:
            continue
        text = hp.text_mit_tags(m.group(2)) if show.roles_any else clean_spoken(m.group(2))   # Hörspiele: Audio-Tags behalten
        if text:
            turns.append((role, text))
    return turns


# ---------- KI-Kennzeichnung (EU AI Act, Art. 50) ----------

KI_HINWEISE = {
    "de": "Dieses Hörspiel wurde mit künstlicher Intelligenz geschrieben und gesprochen.",
    "en": "This story was written and voiced using artificial intelligence.",
    "es": "Este cuento fue escrito y narrado con inteligencia artificial.",
    "pt": "Esta história foi escrita e narrada com inteligência artificial.",
}
KI_HINWEIS = KI_HINWEISE["de"]
KI_NOTIZ = "KI-generiert: Text von Claude (Anthropic), Stimmen und Geräusche von ElevenLabs."


def ki_metadaten(ep: dict, show: Show) -> list[str]:
    """Maschinenlesbare Kennzeichnung als ID3-Tags (COMM und TXXX) in jeder MP3."""
    stimmen = f"ElevenLabs {show.model}" if ELEVEN_KEY else f"Piper {VOICE}"
    return ["-id3v2_version", "3",
            "-metadata", f"title={ep['title']}", "-metadata", f"artist={show.title}",
            "-metadata", f"comment={KI_NOTIZ}",
            "-metadata", "AI_GENERATED=true",
            "-metadata", f"AI_TEXT_MODEL=Claude (Anthropic)",
            "-metadata", f"AI_VOICE_MODEL={stimmen}",
            "-metadata", f"AI_GENERATED_AT={datetime.now(timezone.utc).isoformat(timespec='seconds')}"]


# ---------- Einsprechen ----------

def synthesize(text: str, wav_path: Path) -> None:
    from piper import PiperVoice  # erst hier laden, damit lokale Tests ohne Piper laufen

    voice = PiperVoice.load(str(VOICE_DIR / f"{VOICE}.onnx"))
    with wave.open(str(wav_path), "wb") as wf:
        if hasattr(voice, "synthesize_wav"):
            voice.synthesize_wav(text, wf)
        else:
            voice.synthesize(text, wf)


def to_mp3(wav_path: Path, mp3_path: Path, ep: dict, show: Show) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path),
         "-ac", "1", "-ar", "22050", "-b:a", "64k",
         *ki_metadaten(ep, show),
         str(mp3_path)],
        check=True,
    )


def duration_seconds(mp3_path: Path) -> int:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(mp3_path)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return int(float(out or 0))


def upload(mp3_path: Path, ep: dict, show: Show) -> str:
    tag = f"{show.tag_prefix}{ep['id']}"
    if show.verschluesselt:   # im öffentlichen Release-Speicher nur verschlüsselt, ohne Titel
        enc = mp3_path.with_name(mp3_path.name + ".enc")
        verschluesseln_datei(mp3_path, enc)
        created = subprocess.run(["gh", "release", "create", tag, str(enc), "--repo", REPO,
                                  "--title", tag, "--notes", "verschlüsselt"])
        if created.returncode != 0:
            subprocess.run(["gh", "release", "upload", tag, str(enc), "--repo", REPO, "--clobber"], check=True)
        return f"https://github.com/{REPO}/releases/download/{tag}/{enc.name}"
    created = subprocess.run(["gh", "release", "create", tag, str(mp3_path), "--repo", REPO,
                              "--title", ep["title"], "--notes", f"{ep['kind']} vom {ep['date'][:10]}"])
    if created.returncode != 0:  # Release gibt es schon (z. B. nach Abbruch): Datei ersetzen
        subprocess.run(["gh", "release", "upload", tag, str(mp3_path), "--repo", REPO, "--clobber"],
                       check=True)
    return f"https://github.com/{REPO}/releases/download/{tag}/{mp3_path.name}"


def eleven_post(url: str, body: dict, out: Path) -> None:
    import urllib.request

    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"xi-api-key": ELEVEN_KEY, "Content-Type": "application/json", "Accept": "audio/mpeg"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        out.write_bytes(r.read())


def eleven_tts(text: str, voice_id: str, prev: str, nxt: str, out: Path, show: Show) -> None:
    eleven_post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128",
        {"text": text, "model_id": show.model, "previous_text": prev[-500:], "next_text": nxt[:500],
         "voice_settings": show.voice_settings},
        out,
    )


def eleven_sfx(desc: str, out: Path) -> bool:
    try:
        eleven_post(
            "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",
            {"text": desc[:400], "duration_seconds": 3, "prompt_influence": 0.5},
            out,
        )
        return out.exists() and out.stat().st_size > 1000
    except Exception as exc:  # Geräusche sind Zierde: ohne sie geht es weiter
        print(f"::warning::Geräusch übersprungen ({desc[:40]}…): {exc}")
        return False


def produce_dialog(ep: dict, turns: list[tuple[str, str]], work: Path, mp3: Path, show: Show) -> None:
    """Spricht Zeile für Zeile mit der Stimme der Rolle ein und fügt alles zusammen."""
    parts: list[tuple[Path, bool]] = []
    spoken = [(i, t) for i, (who, t) in enumerate(turns) if who != "GERÄUSCH"]
    sfx_used = 0
    for i, (who, text) in enumerate(turns):
        part = work / f"{ep['id']}_{i:03d}.mp3"
        if who == "GERÄUSCH":
            sfx_prompt = text.split("|")[-1].strip()   # "deutsch | english": englischer Teil fürs Geräusch
            if SFX_ON and sfx_used < SFX_MAX and sfx_prompt and eleven_sfx(sfx_prompt, part):
                sfx_used += 1
                parts.append((part, True))
            continue
        voice = (ep.get("stimmen") or {}).get(who) or show.voices.get(who)
        if not voice:
            print(f"::warning::Unbekannte Rolle {who}, spricht der Erzähler.")
            voice = show.voices.get("ERZÄHLER") or next(iter(show.voices.values()))
        idx = [k for k, _ in spoken].index(i)
        prev = spoken[idx - 1][1] if idx else ""
        nxt = spoken[idx + 1][1] if idx + 1 < len(spoken) else ""
        try:
            eleven_tts(text, voice, prev, nxt, part, show)
        except Exception as exc:  # unbekannte oder entfernte Stimme: Erzähler springt ein
            fallback = show.voices.get("ERZÄHLER")
            if voice == fallback or not fallback:
                raise
            print(f"::warning::Stimme {voice} für {who} nicht nutzbar ({exc}), spricht der Erzähler.")
            eleven_tts(text, fallback, prev, nxt, part, show)
        parts.append((part, False))
    if not parts:
        raise RuntimeError("Keine sprechbaren Zeilen gefunden")
    args = ["ffmpeg", "-y", "-loglevel", "error"]
    for p, _ in parts:
        args += ["-i", str(p)]
    chain = ""
    for i, (_, is_sfx) in enumerate(parts):
        extra = ("volume=0.45,afade=t=in:d=0.4,areverse,afade=t=in:d=0.8,areverse,"
                 if is_sfx else "")
        chain += (f"[{i}:a]{extra}aresample=44100,aformat=channel_layouts=mono,"
                  f"apad=pad_dur={show.pause}[a{i}];")
    chain += "".join(f"[a{i}]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=0:a=1[out]"
    args += ["-filter_complex", chain, "-map", "[out]", "-ac", "1", "-b:a", "96k",
             *ki_metadaten(ep, show), str(mp3)]
    subprocess.run(args, check=True)


def produce(ep: dict, work: Path, show: Show) -> dict:
    print(f"[{show.key}] Spreche ein: {ep['id']}" + ("" if show.verschluesselt else f" – {ep['title']}"), flush=True)   # öffentliche Logs: keine Titel
    wav = work / f"{ep['id']}.wav"
    mp3 = work / f"{ep['id']}.mp3"
    turns = dialog_turns(ep, show)
    hinweis = KI_HINWEISE.get(str(ep.get("sprache", "de")).lower()[:2], KI_HINWEIS)
    if show.roles_any and turns and turns[-1][1] not in KI_HINWEISE.values():
        turns.append(("ERZÄHLER", hinweis))        # hörbarer KI-Hinweis in der Sprache des Hörspiels, immer als letzte Zeile
    m4a = work / f"{ep['id']}.m4a"
    bericht = None
    if turns and ELEVEN_KEY and show.roles_any:
        # Hörspiele: Szenen am Stück mit dem Dialog-Modell, Musik und weiche Übergänge
        def stimme_fuer(wer: str) -> str:
            return (ep.get("stimmen") or {}).get(wer) or show.voices.get(wer) or show.voices["ERZÄHLER"]

        def einzeln(text: str, stimme: str, vorher: str, nachher: str, ziel: Path) -> None:
            try:
                eleven_tts(text, stimme, vorher, nachher, ziel, show)
            except Exception as exc:  # unbekannte Stimme: Erzähler springt ein
                print(f"::warning::Stimme nicht nutzbar ({exc}), spricht der Erzähler.")
                eleven_tts(text, show.voices["ERZÄHLER"], vorher, nachher, ziel, show)

        prod = hp.Produktion(ELEVEN_KEY, work, ep["id"], str(ep.get("sprache", "de")).lower()[:2], einzeln, eleven_sfx, ROOT / "musik")
        bericht = prod.erzeugen(turns, stimme_fuer, SFX_ON, SFX_MAX, mp3, m4a, ki_metadaten(ep, show))
        print(f"[{show.key}] Produktion: {json.dumps(bericht)}")
    elif turns and ELEVEN_KEY:
        produce_dialog(ep, turns, work, mp3, show)
    else:
        if turns:  # Rollenskript, aber kein ElevenLabs-Schlüssel: mit Piper vorlesen
            ep = dict(ep, body="\n\n".join(hp.ohne_tags(t) for who, t in turns if who != "GERÄUSCH"))
            print("::warning::Kein ELEVENLABS_API_KEY gesetzt, nutze Piper als Ersatz.")
        synthesize(speech_text(ep, show), wav)
        to_mp3(wav, mp3, ep, show)
    url = upload(mp3, ep, show)
    if m4a.exists() and show.verschluesselt:   # Fassung für den Player in der App, ebenfalls verschlüsselt
        enc = m4a.with_name(m4a.name + ".enc")
        verschluesseln_datei(m4a, enc)
        subprocess.run(["gh", "release", "upload", f"{show.tag_prefix}{ep['id']}", str(enc), "--repo", REPO, "--clobber"], check=True)
    info = {
        "url": url,
        **({"app_audio": f"{ep['id']}.m4a.enc"} if m4a.exists() and show.verschluesselt else {}),
        **({"produktion": bericht} if bericht else {}),
        "bytes": mp3.stat().st_size,
        "seconds": duration_seconds(mp3),
        "created": datetime.now(timezone.utc).isoformat(),
        "hash": ep["hash"],
        **({"verschluesselt": True} if show.verschluesselt else {}),
    }
    (show.src / f"{ep['id']}.json").write_text(json.dumps(info, indent=2), encoding="utf-8")
    return info


def publish_audio(ep: dict, work: Path, show: Show, info: dict | None = None) -> bool:
    """Legt die MP3 in den Pages-Ordner, damit Podcast-Apps sie direkt laden können.

    Die Releases sind nur der Speicher. Ausgeliefert wird über GitHub Pages,
    weil Apple Podcasts die Weiterleitungen der Release-Downloads nicht abspielt.
    """
    target = show.out / "episodes" / f"{ep['id']}.mp3"
    target.parent.mkdir(parents=True, exist_ok=True)
    local = work / f"{ep['id']}.mp3"
    if local.exists():
        shutil.copy(local, target)
        return True
    if show.verschluesselt:
        tag = f"{show.tag_prefix}{ep['id']}"
        enc = work / f"{ep['id']}.mp3.enc"
        got = subprocess.run(["gh", "release", "download", tag, "--repo", REPO,
                              "--pattern", "*.mp3.enc", "--dir", str(work), "--clobber"])
        ok = got.returncode == 0 and enc.exists()
        uebernahme = show.src / f"{ep['id']}.mp3.enc"   # einmalige Übernahme: verschlüsselte Datei im Repository
        if not ok and uebernahme.exists():
            shutil.copy(uebernahme, enc)
            if subprocess.run(["gh", "release", "upload", tag, str(enc), "--repo", REPO, "--clobber"]).returncode != 0:
                subprocess.run(["gh", "release", "create", tag, str(enc), "--repo", REPO, "--title", tag, "--notes", "verschlüsselt"])
            ok = True
        if not ok:
            print("::warning::Audio für eine Folge nicht gefunden, vorerst nicht im Feed.")
            return False
        entschluesseln_datei(enc, target)
        if info is not None and not info.get("verschluesselt"):
            # Altbestand aufräumen: unverschlüsselte MP3 und Titel aus dem öffentlichen Release entfernen
            subprocess.run(["gh", "release", "delete-asset", tag, f"{ep['id']}.mp3", "--repo", REPO, "-y"], capture_output=True)
            subprocess.run(["gh", "release", "edit", tag, "--repo", REPO, "--title", tag, "--notes", "verschlüsselt"], capture_output=True)
            info["verschluesselt"] = True
            info["url"] = f"https://github.com/{REPO}/releases/download/{tag}/{enc.name}"
            (show.src / f"{ep['id']}.json").write_text(json.dumps(info, indent=2), encoding="utf-8")
        return True
    got = subprocess.run(["gh", "release", "download", f"{show.tag_prefix}{ep['id']}", "--repo", REPO,
                          "--pattern", "*.mp3", "--dir", str(target.parent), "--clobber"])
    if got.returncode != 0 or not target.exists():
        print(f"::warning::Audio für {ep['id']} nicht gefunden, Folge vorerst nicht im Feed.")
        return False
    return True


def audio_url(ep: dict, show: Show, info: dict | None = None) -> str:
    version = re.sub(r"\D", "", (info or {}).get("created", ""))[:14]
    return f"{show.base}/episodes/{ep['id']}.mp3" + (f"?v={version}" if version else "")


# ---------- Feed bauen ----------

def rfc2822(iso: str) -> str:
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        dt = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return format_datetime(dt)


def hms(seconds: int) -> str:
    return f"{seconds // 3600:02d}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}"


def summary(ep: dict, show: Show, limit: int = 600) -> str:
    if ep.get("summary"):
        return ep["summary"]
    if show.roles_any:
        plain = " ".join(t for who, t in dialog_turns(ep, show) if who != "GERÄUSCH")
    else:
        plain = re.sub(r"\s+", " ", speech_text(ep, show).split("\n\n", 1)[-1])
        plain = re.sub(r"\b(ANNA|BEN)\s*:\s*", "", plain, flags=re.I)
    return plain[:limit].rsplit(" ", 1)[0] + " …" if len(plain) > limit else plain


def build_site(show: Show, items: list[tuple[dict, dict]]) -> None:
    show.out.mkdir(parents=True, exist_ok=True)
    cover = ROOT / show.cover
    if cover.exists():
        shutil.copy(cover, show.out / "cover.png")
    e = html.escape
    rss_items = []
    for ep, info in items:
        rss_items.append(f"""    <item>
      <title>{e(ep['title'])}</title>
      <description>{e(summary(ep, show) + " · " + KI_NOTIZ)}</description>
      <itunes:subtitle>{e(ep['kind'])}</itunes:subtitle>
      <enclosure url="{e(audio_url(ep, show, info))}" length="{info['bytes']}" type="audio/mpeg"/>
      <guid isPermaLink="false">{e(ep['id'] + '-' + info.get('created', '')[:19])}</guid>
      <pubDate>{rfc2822(ep['date'])}</pubDate>
      <itunes:duration>{hms(info['seconds'])}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
    </item>""")
    feed = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>{e(show.title)}</title>
    <link>{e(show.base)}/</link>
    <atom:link href="{e(show.base)}/feed.xml" rel="self" type="application/rss+xml"/>
    <language>de-de</language>
    <description>{e(show.description + " " + KI_NOTIZ)}</description>
    <itunes:author>{e(show.title)}</itunes:author>
    <itunes:summary>{e(show.description)}</itunes:summary>
    <itunes:image href="{e(show.base)}/cover.png"/>
    {show.category}
    <itunes:explicit>false</itunes:explicit>
    <itunes:block>Yes</itunes:block>
{chr(10).join(rss_items)}
  </channel>
</rss>
"""
    (show.out / "feed.xml").write_text(feed, encoding="utf-8")

    rows = "\n".join(
        f'<li><p class="m">{e(ep["kind"])} · {e(ep["date"][:10])}</p><h2>{e(ep["title"])}</h2>'
        f'<audio controls preload="none" src="{e(audio_url(ep, show, info))}"></audio></li>'
        for ep, info in items
    )
    page = f"""<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>{e(show.title)}</title>
<style>body{{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:0 auto;padding:24px 16px;color:#14232B;background:#F3F5F6}}
h1{{font-size:26px;margin:0 0 4px}}code{{background:#fff;padding:2px 6px;border-radius:4px;word-break:break-all}}
ul{{list-style:none;padding:0}}li{{background:#fff;border:1px solid #D6DDE0;border-radius:6px;padding:12px 14px;margin:10px 0}}
h2{{font-size:17px;margin:2px 0 8px}}.m{{margin:0;color:#5B6B73;font-size:13px}}audio{{width:100%}}</style></head>
<body><h1>{e(show.title)}</h1><p>Feed für deine Podcast-App: <code>{e(show.base)}/feed.xml</code></p>
<ul>{rows or '<li>Noch keine Folgen.</li>'}</ul></body></html>"""
    (show.out / "index.html").write_text(page, encoding="utf-8")


def run_show(show: Show, work: Path, redo: set[str]) -> int:
    show.src.mkdir(exist_ok=True)
    items: list[tuple[dict, dict]] = []
    failed = 0
    for path in sorted(show.src.glob("*.md.enc" if show.verschluesselt else "*.md")):
        if path.name.lower() == "readme.md":
            continue
        ep = parse_episode(path, show)
        meta_path = show.src / f"{ep['id']}.json"
        info = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else None
        changed = bool(info and info.get("hash") and info["hash"] != ep["hash"])
        if changed:
            print(f"[{show.key}] Text oder Stimmen von {ep['id']} wurden geändert, spreche neu ein.")
        if info and ep["id"] not in redo and not changed:
            pass
        else:
            try:
                info = produce(ep, work, show)
            except Exception as exc:  # eine kaputte Folge soll die anderen nicht blockieren
                failed += 1
                print(f"::warning::Folge {ep['id']} konnte nicht eingesprochen werden: {exc}")
                continue
        items.append((ep, info))
    items.sort(key=lambda x: x[0]["date"], reverse=True)
    items = [(ep, info) for ep, info in items if publish_audio(ep, work, show, info)]
    build_site(show, items)
    print(f"[{show.key}] Feed mit {len(items)} Folgen gebaut" + ("" if show.verschluesselt else f": {show.base}/feed.xml"))
    if failed:
        print(f"[{show.key}] {failed} Folge(n) beim nächsten Lauf erneut versuchen.")
    return failed


def main() -> int:
    work = ROOT / ".work"
    work.mkdir(exist_ok=True)
    redo = set(os.environ.get("REDO", "").split())
    for show in SHOWS:
        if show.verschluesselt:
            if not GEHEIMNIS:
                print(f"::warning::[{show.key}] Secret HOERSPIEL_GEHEIMNIS fehlt: Hörspiele werden nicht veröffentlicht.")
                continue
            print(f"::add-mask::{HS_PFAD}")
            klartext = [p.name for p in show.src.glob("*.md") if p.name.lower() != "readme.md"]
            if klartext:
                print(f"::warning::[{show.key}] {len(klartext)} unverschlüsselte Datei(en) in {show.src.name}/ werden ignoriert.")
        run_show(show, work, redo)
    app = ROOT / "app"   # App-Starter für den Home-Bildschirm
    if app.is_dir():
        shutil.copytree(app, SITE / "app", dirs_exist_ok=True)
    werkstatt = ROOT / "werkstatt"   # Web-Testversion der Hörspielwerkstatt für Freunde (Kopie aus dem Produkt-Repo)
    if werkstatt.is_dir():
        shutil.copytree(werkstatt, SITE / "werkstatt", dirs_exist_ok=True)
    stimmen = ROOT / "stimmen"   # Katalog und Hörproben für die Stimmauswahl
    if stimmen.is_dir():
        shutil.copytree(stimmen, SITE / "stimmen", dirs_exist_ok=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
