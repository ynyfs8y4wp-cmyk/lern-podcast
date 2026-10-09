# Lern-Podcast „Lernroute Agentifizierung“

Dieses Repository macht aus jedem Lernschnipsel und jedem Markt-Radar automatisch eine Podcast-Folge. Die Folgen kommen in deine Podcast-App und laufen dort auch bei gesperrtem Bildschirm.

## So funktioniert es

1. **Text kommt rein:** Der Lern-Coach (eine geplante Claude-Aufgabe) legt jeden neuen Schnipsel als Datei in den Ordner `episodes/`, zum Beispiel `episodes/2026-10-12_G-03.md`.
2. **GitHub Actions startet:** Sobald dort eine neue Datei ankommt, startet der Workflow `.github/workflows/podcast.yml` auf einer frischen Linux-VM von GitHub.
3. **Einsprechen:** Das Skript `scripts/build.py` bereitet den Text zum Vorlesen auf und lässt ihn von der freien Sprachsoftware **Piper** mit einer deutschen Stimme einsprechen. Daraus wird eine MP3-Datei.
4. **Ablegen:** Die MP3 wird als Datei an ein GitHub-Release gehängt. Das ist der Speicher, so bleibt das Repository selbst klein. Ausgeliefert wird sie über GitHub Pages, weil Podcast-Apps sie dort zuverlässig abspielen.
5. **Feed veröffentlichen:** Aus allen Folgen entsteht ein Podcast-Feed (`feed.xml`), der über GitHub Pages erreichbar ist. Deine Podcast-App fragt ihn regelmäßig ab und lädt neue Folgen.

Kosten: keine. GitHub Actions ist für öffentliche Repositories kostenlos, Piper ist Open Source und läuft direkt auf der GitHub-VM, ohne API-Schlüssel.

## Einmalige Einrichtung

1. **GitHub Pages einschalten:** Settings → Pages → bei „Source“ **GitHub Actions** wählen.
2. **Ersten Lauf starten:** Actions → „Lern-Podcast“ → **Run workflow**.
3. **Feed abonnieren:** Die Adresse lautet `https://<github-name>.github.io/<repo-name>/feed.xml`. In Apple Podcasts: Mediathek → oben rechts „…“ → **Sendung per URL folgen**. In Pocket Casts oder Overcast: Suche → URL einfügen.

## Wichtig zur Sichtbarkeit

Für kostenloses GitHub Pages muss das Repository öffentlich sein. Die Lerninhalte sind allgemeines Wissen ohne Firmeninterna. Der Feed ist so markiert, dass er nicht in Podcast-Verzeichnissen gelistet wird, und Suchmaschinen sollen die Seite nicht aufnehmen. Wer die Adresse kennt, kann ihn aber abrufen. Deshalb gehören hier **keine vertraulichen Inhalte** hinein. Mit einem bezahlten GitHub-Plan geht Pages auch für private Repositories.

## Stimmen: ElevenLabs mit zwei Moderatoren

Folgen, deren Text aus Zeilen wie `ANNA: ...` und `BEN: ...` besteht, werden als Gespräch mit zwei Stimmen von **ElevenLabs** eingesprochen. Dafür braucht das Repository einen Schlüssel:

1. Bei elevenlabs.io ein Konto anlegen und einen Tarif wählen, der zum Umfang passt (rund 100.000 Zeichen im Monat).
2. Dort unter **API Keys** einen Schlüssel erzeugen.
3. Hier im Repository: Settings → Secrets and variables → Actions → **New repository secret**, Name `ELEVENLABS_API_KEY`, Wert der Schlüssel.

Ohne Schlüssel spricht weiterhin Piper, damit der Podcast nie ausfällt.

Stimmen wechseln: Unter **Variables** `ELEVEN_VOICE_ANNA` und `ELEVEN_VOICE_BEN` mit der Voice-ID aus der ElevenLabs-Stimmbibliothek setzen. Eine bestehende Folge neu einsprechen: Actions → „Lern-Podcast“ → Run workflow → bei „Folgen-IDs“ die ID eintragen, z. B. `2026-10-09_G-01`.

## Anpassen (optional)

Unter Settings → Secrets and variables → Actions → **Variables**:

- `PIPER_VOICE`: andere deutsche Stimme, z. B. `de_DE-thorsten-medium` oder `de_DE-kerstin-low`. Standard ist `de_DE-thorsten-high`.
- `PODCAST_TITLE`: anderer Name für den Podcast.

## Was du hier lernen kannst

Dieses kleine Projekt zeigt die Bausteine, über die dein Team täglich spricht:

- **Repository:** der gemeinsame Ordner mit Versionsgeschichte.
- **Workflow (YAML):** das Rezept. Es beantwortet „wann“ (`on:`), „wo“ (`runs-on:`) und „was“ (`steps:`).
- **Runner und Runtime:** die frische VM, auf der alles läuft und die danach wieder verschwindet.
- **Permissions und Token:** welche Rechte der Workflow bekommt, und nicht mehr als nötig.
- **Release und Pages:** wie Ergebnisse veröffentlicht werden.
- **Cache:** die Stimme wird einmal geladen und danach wiederverwendet.
