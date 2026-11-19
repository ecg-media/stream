# Stream – Übersetzung live aufs Handy

Mit diesem Programm hören Zuhörer eine Übersetzung (oder jeden anderen Ton) **live auf ihrem eigenen Handy** – ohne App, einfach im Browser. Ein Computer nimmt den Ton auf (z. B. vom Mischpult oder Mikrofon des Übersetzers) und schickt ihn über das WLAN an alle Handys. Der Ton kommt **ohne spürbare Verzögerung** an.

- Für Zuhörer: Adresse öffnen, auf den großen Knopf tippen, fertig.
- Mehrere Kanäle möglich, z. B. „Russisch“ und „Englisch“ gleichzeitig.
- Texte für Zuhörer in 14 Sprachen: Deutsch, Englisch, Russisch, Ukrainisch, Persisch, Arabisch, Hebräisch, Türkisch, Rumänisch, Polnisch, Spanisch, Französisch, Armenisch, Georgisch.
- Heller und dunkler Modus.
- Statistik: Wie viele Zuhörer waren an welchem Tag im Durchschnitt da?
- Funktioniert nur im eigenen Netzwerk (WLAN/LAN). Das Internet wird nur für die Installation und Updates gebraucht.

![So funktioniert es](diagram.svg)

---

## Was Sie brauchen

1. **Einen Computer**, der während des Gottesdienstes / der Veranstaltung läuft (Windows 10/11, Mac oder Linux).
2. **Eine Tonquelle** an diesem Computer: Mikrofon, USB-Audio-Interface oder Kabel vom Mischpult.
3. **Ein WLAN**, in dem der Computer und die Handys der Zuhörer sind.

---

## Installation

Die Installation dauert etwa 5 Minuten. Danach startet das Programm **automatisch**, sobald der Computer eingeschaltet wird.

### Windows

1. Laden Sie die Datei [install-windows.cmd](https://raw.githubusercontent.com/ecg-media/stream/main/installer/install-windows.cmd) herunter (Rechtsklick auf den Link → „Link speichern unter …“).
2. Doppelklick auf die heruntergeladene Datei.
3. Falls Windows warnt („Der Computer wurde durch Windows geschützt“): auf **Weitere Informationen** → **Trotzdem ausführen** klicken.
4. Die Frage nach Administratorrechten mit **Ja** beantworten.
5. Warten, bis **„Fertig!“** erscheint. Dort stehen auch die Adressen für Zuhörer und Verwaltung.

### Mac

1. Programm **Terminal** öffnen (Spotlight: `⌘ + Leertaste`, „Terminal“ eingeben).
2. Diese Zeile hineinkopieren und Enter drücken:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/ecg-media/stream/main/installer/install.sh | sudo bash
   ```
3. Ihr Mac-Passwort eingeben (beim Tippen ist nichts zu sehen – das ist normal) und Enter drücken.
4. Warten, bis **„Fertig!“** erscheint.

### Linux (Ubuntu, Debian, Fedora, Raspberry Pi OS …)

1. Ein Terminal öffnen.
2. Diese Zeile hineinkopieren und Enter drücken:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/ecg-media/stream/main/installer/install.sh | sudo bash
   ```
3. Passwort eingeben und warten, bis **„Fertig!“** erscheint.

---

## Erste Schritte

### 1. Verwaltung öffnen

Am **Computer, auf dem das Programm installiert ist**, im Browser (Chrome, Edge, Firefox oder Safari) diese Adresse öffnen:

```
http://localhost/publish.html
```

> Senden geht aus Sicherheitsgründen der Browser **nur direkt an diesem Computer**. Kanäle bearbeiten und die Statistik ansehen geht auch von anderen Geräten aus (Adresse `http://<IP-Adresse>/publish.html`).

### 2. Kanal einrichten

- Unter **Kanäle** ist schon ein Kanal „Übersetzung“ vorhanden.
- Mit **Bearbeiten** geben Sie ihm einen Namen (z. B. „Russische Übersetzung“) und wählen die **gesprochene Sprache**. Die Zuhörer sehen dann alle Hinweise in dieser Sprache.
- Mit **Kanal hinzufügen** (oben rechts) legen Sie weitere Kanäle an, z. B. für eine zweite Sprache.

### 3. Senden

- Bei dem Kanal die **Audioquelle** auswählen (beim ersten Mal fragt der Browser, ob er auf das Mikrofon zugreifen darf → **Erlauben**).
- Kommt der Ton per Kabel vom **Mischpult**, das Häkchen **„Mischpult-Eingang“** setzen. Dann verändert der Browser den Ton nicht (keine Echo- und Rauschfilter). Bei einem einfachen Mikrofon das Häkchen weglassen.
- Auf **Senden starten** tippen. Der farbige Balken zeigt, dass Ton ankommt.
- Zum Schluss **Senden beenden**.
- Die Seite der Verwaltung muss während des Sendens **geöffnet bleiben**.

### 4. Zuhören

Die Zuhörer öffnen auf dem Handy die Adresse, die in der Verwaltung unter dem **Zahnrad oben rechts (Einstellungen) → Adresse für Zuhörer** steht, z. B.:

```
http://192.168.1.20
```

und tippen auf den **großen Knopf**. Das ist alles. Die Ringe um den Knopf bewegen sich mit dem Ton.

> `localhost` funktioniert nur am Server-Computer selbst. Die Handys brauchen immer die Adresse aus den Einstellungen (die Netzwerk-Adresse des Computers).

- Gibt es nur **einen Kanal**, startet die Seite direkt in diesem Kanal.
- Gibt es **mehrere Kanäle**, wählen die Zuhörer einmal ihren Kanal aus. Das Handy merkt sich die Wahl für das nächste Mal. Über **Kanal wechseln** (oben rechts) kann man jederzeit wechseln.
- Hat die Übertragung noch nicht begonnen, steht dort „Bitte warten“. Sobald gesendet wird, geht es **von allein los**.
- Oben rechts kann man zwischen **hell und dunkel** umschalten.

> **Tipp:** Drucken Sie die Adresse groß aus oder machen Sie daraus einen QR-Code (z. B. mit einem kostenlosen QR-Code-Generator), den die Zuhörer nur abfotografieren müssen.

---

## Sprache und Darstellung der Verwaltung

Über das **Zahnrad oben rechts** stellen Sie die Sprache der Verwaltung um (**Deutsch, Русский, English, Українська**) und wählen hell oder dunkel. Die Einstellung merkt sich der Browser. Die Sprache der Zuhörer-Seite hängt davon nicht ab – sie richtet sich nach der Sprache des Kanals.

## Passwort für die Verwaltung (empfohlen)

Ohne Passwort kann **jeder im WLAN** die Verwaltung öffnen. Über das **Zahnrad oben rechts → Admin-Passwort** legen Sie ein Passwort fest. Danach muss man sich in der Verwaltung einmal anmelden (die Anmeldung bleibt 30 Tage gespeichert). Zuhörer brauchen **kein** Passwort. Nach 5 falschen Versuchen ist die Anmeldung für eine Minute gesperrt.

Passwort vergessen? Siehe [Häufige Fragen](#häufige-fragen).

## Statistik

Unter **Statistik** sehen Sie:

- wie viele Zuhörer **pro Tag** durchschnittlich verbunden waren (und den Höchstwert),
- den Durchschnitt pro **Wochentag** (Mo – So),
- eine Tabelle mit allen Tagen und der Sendezeit.

Gezählt wird **jede Minute, in der gesendet wird**. Der Durchschnitt wird in **ganzen Zuhörern** angegeben und nur über die Minuten berechnet, in denen mindestens eine Person zugehört hat. Hört also eine Person zu, steht dort „1“ – auch wenn die Übertragung schon vorher lief. Die Sendezeit in der Tabelle ist die gesamte Zeit, in der gesendet wurde. Sie können die Statistik für alle Kanäle zusammen oder für einen einzelnen Kanal ansehen. Die Statistik wird **400 Tage** aufbewahrt, ältere Tage werden automatisch gelöscht.

---

## Aktualisieren

Ihre Kanäle, das Passwort und die Statistik bleiben bei einem Update erhalten.

- **Windows:** [update-windows.cmd](https://raw.githubusercontent.com/ecg-media/stream/main/installer/update-windows.cmd) herunterladen und doppelklicken – oder `install-windows.cmd` einfach noch einmal starten.
- **Mac und Linux:** Die Zeile aus der Installation einfach noch einmal ausführen:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/ecg-media/stream/main/installer/install.sh | sudo bash
  ```

## Deinstallieren

- **Windows:** In einer Eingabeaufforderung `install-windows.cmd -Uninstall` ausführen.
- **Mac und Linux:**
  ```bash
  sudo bash /opt/ecg-stream/app/installer/install.sh --uninstall
  ```

---

## Häufige Fragen

**Das Handy findet die Seite nicht.**
Ist das Handy im **selben WLAN** wie der Computer (nicht im mobilen Netz / Gäste-WLAN)? Stimmt die Adresse (Zahnrad → Adresse für Zuhörer)? `localhost` funktioniert auf dem Handy nicht.

**Die Seite lädt, aber es kommt kein Ton.**
- Wird gesendet? In der Verwaltung muss beim Kanal **„Sendet“** stehen.
- Ist das Handy auf lautlos oder die Lautstärke ganz unten?
- Manche Gäste-WLANs verhindern, dass Geräte miteinander sprechen („Client-Isolation“). Dann ein anderes WLAN verwenden.

**„Senden starten“ ist ausgegraut.**
Die Verwaltung ist nicht direkt am Server-Computer unter `http://localhost/publish.html` geöffnet. Senden geht nur dort (oder über HTTPS, siehe unten).

**Die Audioquelle fehlt in der Liste.**
Gerät anschließen und die Seite neu laden. Beim ersten Mal muss der Mikrofon-Zugriff im Browser erlaubt werden.

**Alle Zuhörer sollen die Seite neu laden (z. B. nach einem Update).**
In der Verwaltung beim Kanal auf **Zuhörer neu laden** tippen.

**Admin-Passwort vergessen.**
Am Server-Computer:
- Windows (Eingabeaufforderung als Administrator):
  ```bat
  sc stop EcgStream
  set DATA_DIR=%ProgramData%\ecg-stream
  "%ProgramFiles%\ecg-stream\node\node.exe" "%ProgramFiles%\ecg-stream\app\server\index.js" --set-password
  sc start EcgStream
  ```
- Linux:
  ```bash
  sudo systemctl stop ecg-stream && sudo -u ecg-stream DATA_DIR=/opt/ecg-stream/data /opt/ecg-stream/node/bin/node /opt/ecg-stream/app/server/index.js --set-password; sudo systemctl start ecg-stream
  ```
- Mac:
  ```bash
  sudo launchctl bootout system/media.ecg.stream; DATA_DIR=/opt/ecg-stream/data /opt/ecg-stream/node/bin/node /opt/ecg-stream/app/server/index.js --set-password; sudo launchctl bootstrap system /Library/LaunchDaemons/media.ecg.stream.plist
  ```
Leer lassen und Enter drücken entfernt das Passwort.

**Wo finde ich das Protokoll bei Problemen?**
Windows: `C:\ProgramData\ecg-stream\server.log` · Linux: `journalctl -u ecg-stream` · Mac: `/var/log/ecg-stream.log`

---

## Für Fortgeschrittene

### Einstellungen beim Installieren

| Einstellung | Standard | Bedeutung |
|---|---|---|
| `PORT` | `80` | Port der Webseite |
| `RTC_PORT` | `10000` | Port für den Ton (UDP und TCP) |
| `IP` | automatisch | IP-Adresse, unter der Handys den Ton abholen. Nur setzen, wenn die automatische Erkennung die falsche Netzwerkkarte wählt. |
| `DATA_DIR` | `data/` | Ordner für Kanäle, Passwort und Statistik |

Beispiele:

```bash
curl -fsSL https://raw.githubusercontent.com/ecg-media/stream/main/installer/install.sh | sudo PORT=8080 IP=192.168.1.20 bash
```

```bat
install-windows.cmd -Port 8080 -Ip 192.168.1.20
```

Die Firewall wird vom Installer für diese Ports geöffnet (unter Windows nur für das lokale Netz).

### Zugriff von außen (Reverse Proxy)

Das Programm ist **nur für lokale Netzwerke** gedacht und bringt bewusst kein HTTPS mit. Soll es von außen oder per HTTPS erreichbar sein, gehört ein Reverse Proxy (z. B. nginx, Caddy, Traefik) davor. Wichtig:

- WebSockets müssen weitergeleitet werden (`/socket.io/`).
- Der Ton läuft **nicht** über den Proxy, sondern direkt per WebRTC über `RTC_PORT` (UDP/TCP). Dieser Port muss von den Zuhörern erreichbar sein, und `IP` muss die von dort erreichbare Adresse sein.
- Setzen Sie unbedingt ein Admin-Passwort.

Beispiel für nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:80;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

Über HTTPS kann auch von anderen Geräten aus gesendet werden.

### Ohne Installer starten (Entwickler)

Voraussetzung: [Node.js](https://nodejs.org) 22 oder neuer.

```bash
npm ci
npm start
```

```bash
npm test
```

Technische Details: [docs/architecture.md](docs/architecture.md).

## Credits

Ursprünglich basierend auf dem Broadcast-Beispiel von https://github.com/mganeko/mediasoup_v3_example/.
Icons: [Material Icons](https://github.com/google/material-design-icons) von Google (Apache License 2.0).
