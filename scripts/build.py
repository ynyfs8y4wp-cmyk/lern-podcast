"""Lern-Podcast: spricht neue Folgen ein und baut den Podcast-Feed.

Ablauf:
1. Jede Datei episodes/<id>.md ist eine Folge (Lernschnipsel oder Markt-Radar).
2. Fehlt dazu episodes/<id>.json, ist die Folge neu: Text aufbereiten,
   mit Piper einsprechen, mit ffmpeg zu MP3 wandeln und als
   GitHub-Release-Datei ablegen. Danach werden Größe, Dauer und Link
   in episodes/<id>.json gespeichert.
3. Aus allen Folgen entsteht site/feed.xml (für die Podcast-App)
   und site/index.html (eine einfache Übersicht im Browser).
"""

from __future__ import annotations

import html
import json
import os
import re
import shutil
import subprocess
import sys
import wave
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EPISODES = ROOT / "episodes"
SITE = ROOT / "site"
VOICE_DIR = ROOT / "voice"

REPO = os.environ.get("GITHUB_REPOSITORY", "owner/lern-podcast")
OWNER, REPO_NAME = REPO.split("/", 1)
BASE_URL = os.environ.get("PODCAST_BASE_URL", f"https://{OWNER.lower()}.github.io/{REPO_NAME}")
TITLE = os.environ.get("PODCAST_TITLE", "Lernroute Agentifizierung")
VOICE = os.environ.get("PIPER_VOICE", "de_DE-thorsten-high")

# ElevenLabs: zwei Moderatoren. Ohne Schlüssel fällt das Skript auf Piper zurück.
ELEVEN_KEY = os.environ.get("ELEVENLABS_API_KEY", "").strip()
ELEVEN_MODEL = os.environ.get("ELEVEN_MODEL") or "eleven_multilingual_v2"
HOSTS = {
    "ANNA": os.environ.get("ELEVEN_VOICE_ANNA") or "EXAVITQu4vr4xnSDxMaL",
    "BEN": os.environ.get("ELEVEN_VOICE_BEN") or "JBFqnCBsd6RMkjVDRZzb",
}
TURN = re.compile(r"^\s*\**(ANNA|BEN)\**\s*:\s*(.+)$", re.I)
DESCRIPTION = (
    "Private Lernfolgen zu KI-Agenten, Softwareentwicklung und Agentifizierung "
    "im indirekten Bereich, einfach erklärt. Dazu der wöchentliche Markt-Radar."
)


# ---------- Folgen lesen ----------

def parse_episode(path: Path) -> dict:
    """Liest Kopfdaten (zwischen ---) und Text einer Folge."""
    raw = path.read_text(encoding="utf-8")
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
    meta.setdefault("kind", "Lernschnipsel")
    meta.setdefault("date", datetime.now(timezone.utc).isoformat())
    meta["id"] = path.stem
    meta["body"] = body.strip()
    return meta


def speech_text(ep: dict) -> str:
    """Macht aus Markdown einen gut vorlesbaren Text."""
    t = ep["body"]
    t = re.sub(r"```.*?```", " Ein kurzes Beispiel steht im geschriebenen Text. ", t, flags=re.S)
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)          # Links: nur Linktext
    t = re.sub(r"https?://\S+", "", t)                        # nackte Adressen weg
    t = re.sub(r"^#{1,6}\s*(.+?)\s*$", r"\1.", t, flags=re.M)  # Überschrift -> Satz
    t = re.sub(r"^\s*[-*•]\s+", "", t, flags=re.M)            # Aufzählungszeichen
    t = re.sub(r"[*_`>|]", "", t)
    t = re.sub(r"\.\.+", ".", t)
    t = re.sub(r"[ \t]+", " ", t)
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", t) if p.strip()]
    paragraphs = [re.sub(r"\s*\n\s*", " ", p) for p in paragraphs]
    intro = f"{TITLE}. {ep['kind']}: {ep['title']}."
    outro = "Das war die Folge. Bis zum nächsten Mal."
    return "\n\n".join([intro, *paragraphs, outro])


# ---------- Einsprechen ----------

def synthesize(text: str, wav_path: Path) -> None:
    from piper import PiperVoice  # erst hier laden, damit lokale Tests ohne Piper laufen

    voice = PiperVoice.load(str(VOICE_DIR / f"{VOICE}.onnx"))
    with wave.open(str(wav_path), "wb") as wf:
        if hasattr(voice, "synthesize_wav"):      # piper-tts ab 1.3
            voice.synthesize_wav(text, wf)
        else:                                      # ältere Versionen
            voice.synthesize(text, wf)


def to_mp3(wav_path: Path, mp3_path: Path, ep: dict) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path),
         "-ac", "1", "-ar", "22050", "-b:a", "64k",
         "-metadata", f"title={ep['title']}", "-metadata", f"artist={TITLE}",
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


def upload(mp3_path: Path, ep: dict) -> str:
    tag = f"ep-{ep['id']}"
    created = subprocess.run(["gh", "release", "create", tag, str(mp3_path), "--repo", REPO,
                              "--title", ep["title"], "--notes", f"{ep['kind']} vom {ep['date'][:10]}"])
    if created.returncode != 0:  # Release gibt es schon (z. B. nach Abbruch): Datei ersetzen
        subprocess.run(["gh", "release", "upload", tag, str(mp3_path), "--repo", REPO, "--clobber"],
                       check=True)
    return f"https://github.com/{REPO}/releases/download/{tag}/{mp3_path.name}"


def dialog_turns(ep: dict) -> list[tuple[str, str]]:
    """Zeilen der Form 'ANNA: ...' / 'BEN: ...' als Gesprächsbeiträge."""
    turns = []
    for line in ep["body"].splitlines():
        m = TURN.match(line)
        if m:
            text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", m.group(2))
            text = re.sub(r"https?://\S+|[*_`#>|]", "", text).strip()
            if text:
                turns.append((m.group(1).upper(), text))
    return turns


def eleven_tts(text: str, voice_id: str, prev: str, nxt: str, out: Path) -> None:
    import urllib.request

    body = {
        "text": text,
        "model_id": ELEVEN_MODEL,
        "previous_text": prev[-500:],
        "next_text": nxt[:500],
        "voice_settings": {"stability": 0.4, "similarity_boost": 0.8, "style": 0.35,
                           "use_speaker_boost": True},
    }
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128",
        data=json.dumps(body).encode("utf-8"),
        headers={"xi-api-key": ELEVEN_KEY, "Content-Type": "application/json",
                 "Accept": "audio/mpeg"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        out.write_bytes(r.read())


def produce_dialog(ep: dict, turns: list[tuple[str, str]], work: Path, mp3: Path) -> None:
    """Spricht das Gespräch Satz für Satz mit zwei Stimmen ein und fügt es zusammen."""
    parts = []
    for i, (who, text) in enumerate(turns):
        part = work / f"{ep['id']}_{i:03d}.mp3"
        prev = turns[i - 1][1] if i else ""
        nxt = turns[i + 1][1] if i + 1 < len(turns) else ""
        eleven_tts(text, HOSTS[who], prev, nxt, part)
        parts.append(part)
    # kurze Atempause zwischen den Sprechern, dann alles zu einer Datei
    args = ["ffmpeg", "-y", "-loglevel", "error"]
    for p in parts:
        args += ["-i", str(p)]
    chain = "".join(f"[{i}:a]aresample=44100,aformat=channel_layouts=mono,apad=pad_dur=0.25[a{i}];"
                    for i in range(len(parts)))
    chain += "".join(f"[a{i}]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=0:a=1[out]"
    args += ["-filter_complex", chain, "-map", "[out]", "-ac", "1", "-b:a", "96k",
             "-metadata", f"title={ep['title']}", "-metadata", f"artist={TITLE}", str(mp3)]
    subprocess.run(args, check=True)


def produce(ep: dict, work: Path) -> dict:
    print(f"Spreche ein: {ep['id']} – {ep['title']}", flush=True)
    wav = work / f"{ep['id']}.wav"
    mp3 = work / f"{ep['id']}.mp3"
    turns = dialog_turns(ep)
    if turns and ELEVEN_KEY:
        produce_dialog(ep, turns, work, mp3)
    else:
        if turns:  # Gespräch, aber kein ElevenLabs-Schlüssel: mit Piper vorlesen
            ep = dict(ep, body="\n\n".join(t for _, t in turns))
            print("::warning::Kein ELEVENLABS_API_KEY gesetzt, nutze Piper als Ersatz.")
        synthesize(speech_text(ep), wav)
        to_mp3(wav, mp3, ep)
    info = {
        "url": upload(mp3, ep),
        "bytes": mp3.stat().st_size,
        "seconds": duration_seconds(mp3),
        "created": datetime.now(timezone.utc).isoformat(),
    }
    (EPISODES / f"{ep['id']}.json").write_text(json.dumps(info, indent=2), encoding="utf-8")
    return info


def publish_audio(ep: dict, work: Path) -> bool:
    """Legt die MP3 in den Pages-Ordner, damit Podcast-Apps sie direkt laden können.

    Die Releases sind nur der Speicher. Ausgeliefert wird über GitHub Pages,
    weil Apple Podcasts die Weiterleitungen der Release-Downloads nicht abspielt.
    """
    target = SITE / "episodes" / f"{ep['id']}.mp3"
    target.parent.mkdir(parents=True, exist_ok=True)
    local = work / f"{ep['id']}.mp3"
    if local.exists():
        shutil.copy(local, target)
        return True
    got = subprocess.run(["gh", "release", "download", f"ep-{ep['id']}", "--repo", REPO,
                          "--pattern", "*.mp3", "--dir", str(target.parent), "--clobber"])
    if got.returncode != 0 or not target.exists():
        print(f"::warning::Audio für {ep['id']} nicht gefunden, Folge vorerst nicht im Feed.")
        return False
    return True


def audio_url(ep: dict, info: dict | None = None) -> str:
    # Versionszusatz, damit Podcast-Apps eine neu eingesprochene Folge neu laden
    version = re.sub(r"\D", "", (info or {}).get("created", ""))[:14]
    return f"{BASE_URL}/episodes/{ep['id']}.mp3" + (f"?v={version}" if version else "")


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


def summary(ep: dict, limit: int = 600) -> str:
    plain = re.sub(r"\s+", " ", speech_text(ep).split("\n\n", 1)[-1])
    plain = re.sub(r"\b(ANNA|BEN)\s*:\s*", "", plain, flags=re.I)
    return plain[:limit].rsplit(" ", 1)[0] + " …" if len(plain) > limit else plain


def build_site(items: list[tuple[dict, dict]]) -> None:
    SITE.mkdir(exist_ok=True)
    cover = ROOT / "cover.png"
    if cover.exists():
        shutil.copy(cover, SITE / "cover.png")
    e = html.escape
    rss_items = []
    for ep, info in items:
        rss_items.append(f"""    <item>
      <title>{e(ep['title'])}</title>
      <description>{e(summary(ep))}</description>
      <itunes:subtitle>{e(ep['kind'])}</itunes:subtitle>
      <enclosure url="{e(audio_url(ep, info))}" length="{info['bytes']}" type="audio/mpeg"/>
      <guid isPermaLink="false">{e(ep['id'] + '-' + info.get('created', '')[:19])}</guid>
      <pubDate>{rfc2822(ep['date'])}</pubDate>
      <itunes:duration>{hms(info['seconds'])}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
    </item>""")
    feed = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>{e(TITLE)}</title>
    <link>{e(BASE_URL)}/</link>
    <atom:link href="{e(BASE_URL)}/feed.xml" rel="self" type="application/rss+xml"/>
    <language>de-de</language>
    <description>{e(DESCRIPTION)}</description>
    <itunes:author>{e(TITLE)}</itunes:author>
    <itunes:summary>{e(DESCRIPTION)}</itunes:summary>
    <itunes:image href="{e(BASE_URL)}/cover.png"/>
    <itunes:category text="Technology"/>
    <itunes:explicit>false</itunes:explicit>
    <itunes:block>Yes</itunes:block>
{chr(10).join(rss_items)}
  </channel>
</rss>
"""
    (SITE / "feed.xml").write_text(feed, encoding="utf-8")

    rows = "\n".join(
        f'<li><p class="m">{e(ep["kind"])} · {e(ep["date"][:10])}</p><h2>{e(ep["title"])}</h2>'
        f'<audio controls preload="none" src="{e(audio_url(ep, info))}"></audio></li>'
        for ep, info in items
    )
    page = f"""<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>{e(TITLE)}</title>
<style>body{{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:0 auto;padding:24px 16px;color:#14232B;background:#F3F5F6}}
h1{{font-size:26px;margin:0 0 4px}}code{{background:#fff;padding:2px 6px;border-radius:4px;word-break:break-all}}
ul{{list-style:none;padding:0}}li{{background:#fff;border:1px solid #D6DDE0;border-radius:6px;padding:12px 14px;margin:10px 0}}
h2{{font-size:17px;margin:2px 0 8px}}.m{{margin:0;color:#5B6B73;font-size:13px}}audio{{width:100%}}</style></head>
<body><h1>{e(TITLE)}</h1><p>Feed für deine Podcast-App: <code>{e(BASE_URL)}/feed.xml</code></p>
<ul>{rows or '<li>Noch keine Folgen.</li>'}</ul></body></html>"""
    (SITE / "index.html").write_text(page, encoding="utf-8")


def main() -> int:
    EPISODES.mkdir(exist_ok=True)
    work = ROOT / ".work"
    work.mkdir(exist_ok=True)
    items: list[tuple[dict, dict]] = []
    failed = 0
    for path in sorted(EPISODES.glob("*.md")):
        ep = parse_episode(path)
        meta_path = EPISODES / f"{ep['id']}.json"
        redo = ep["id"] in os.environ.get("REDO", "").split()
        if meta_path.exists() and not redo:
            info = json.loads(meta_path.read_text(encoding="utf-8"))
        else:
            try:
                info = produce(ep, work)
            except Exception as exc:  # eine kaputte Folge soll die anderen nicht blockieren
                failed += 1
                print(f"::warning::Folge {ep['id']} konnte nicht eingesprochen werden: {exc}")
                continue
        items.append((ep, info))
    items.sort(key=lambda x: x[0]["date"], reverse=True)
    items = [(ep, info) for ep, info in items if publish_audio(ep, work)]
    build_site(items)
    print(f"Feed mit {len(items)} Folgen gebaut: {BASE_URL}/feed.xml")
    if failed:
        print(f"{failed} Folge(n) beim nächsten Lauf erneut versuchen.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
