# Chrome Setup für MCP Screenshot Server

## 🎯 Übersicht

Diese Anleitung zeigt, wie du Chrome korrekt startest, damit der MCP Screenshot Server auf deine bestehende Browser-Session zugreifen kann (mit Login, Cookies, etc.).

## 🚀 Chrome mit Debugging starten

### **Schritt 1: Chrome komplett beenden**
```bash
# Alle Chrome-Prozesse beenden
pkill -f google-chrome
# oder
killall google-chrome

# Kurz warten
sleep 2
```

### **Schritt 2: Chrome mit Debugging-Flags starten**

**Öffne ein Terminal** und führe aus:

```bash
google-chrome \
  --remote-debugging-port=9222 \
  --remote-debugging-address=127.0.0.1 \
  --user-data-dir=/tmp/chrome-debug-session \
  --no-first-run \
  --disable-default-apps &
```

**Alternative (einfacher):**
```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-session &
```

### **Schritt 3: Debugging-Verbindung testen**
```bash
curl http://localhost:9222/json/version
```

**Erwartete Ausgabe:** Chrome-Versionsinformationen in JSON-Format
```json
{
   "Browser": "Chrome/139.0.7258.138",
   "Protocol-Version": "1.3",
   "User-Agent": "Mozilla/5.0...",
   ...
}
```

❌ **Wenn Fehler:** `curl: (7) Failed to connect` → Chrome nicht korrekt gestartet, wiederhole Schritt 1-2

## 🔐 Session einrichten

### **Schritt 4: In deiner Anwendung einloggen**
1. **Navigiere zu:** `http://taxtastic.local:8083/wp-login.php`
2. **Logge dich ein** mit deinen Credentials
3. **Gehe zur Zielseite:** `http://taxtastic.local:8083/steuer-profil/`
4. **Lass den Tab offen**

## 📱 VS Code einrichten

### **Schritt 5: VS Code MCP Server aktivieren**
1. **VS Code öffnen**
2. **Drücke:** `Cmd+Shift+P` (Mac) oder `Ctrl+Shift+P` (Windows/Linux)
3. **Tippe:** "Developer: Reload Window"
4. **Enter drücken**

### **Schritt 6: Screenshot testen**
**In VS Code Copilot Chat:**
```
Nimm einen Screenshot von http://taxtastic.local:8083/steuer-profil/
```

**Erfolgreiche Ausgabe sollte enthalten:**
- ✅ `"Used: existing Chrome session"`
- ✅ Screenshot der eingeloggten Seite

## 🔧 Troubleshooting

### Chrome startet nicht richtig
```bash
# Prüfe ob Chrome läuft
ps aux | grep chrome | grep remote-debugging

# Prüfe ob Port offen ist
netstat -tlnp | grep 9222
# oder
ss -tlnp | grep 9222
```

### VS Code findet Server nicht
1. **MCP Konfiguration prüfen:** `/home/gunter/.config/Code/User/profiles/-6392e99a/mcp.json`
2. **Server-Pfad validieren:** `/home/gunter/screenshot-mcp-server/mcp-with-existing-chrome.js`
3. **VS Code Output prüfen:** View → Output → "MCP" auswählen

### Screenshot zeigt Login-Seite statt eingeloggte Inhalte
- **Session verloren** → Schritt 4 wiederholen
- **Falscher Tab verwendet** → Nur einen Tab mit der Zielseite offen lassen
- **Chrome-Session neu** → Von Schritt 1 neu beginnen

## 📋 Schnell-Checkliste

**Vor jeder VS Code Session:**

1. ✅ **Chrome mit Debugging starten**
   ```bash
   google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-session &
   ```

2. ✅ **Debugging testen**
   ```bash
   curl http://localhost:9222/json/version
   ```

3. ✅ **Einloggen und zur Zielseite navigieren**
   - Login: `http://taxtastic.local:8083/wp-login.php`
   - Ziel: `http://taxtastic.local:8083/steuer-profil/`

4. ✅ **VS Code neu laden**
   ```
   Cmd+Shift+P → "Developer: Reload Window"
   ```

5. ✅ **Screenshot testen**

## 🎛️ Erweiterte Konfiguration

### Permanente Chrome-Verknüpfung erstellen

**Desktop-Datei erstellen:**
```bash
cat > ~/Desktop/Chrome-Debug.desktop << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=Chrome Debug
Comment=Chrome with Remote Debugging for MCP
Exec=google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-session
Icon=google-chrome
Terminal=false
StartupNotify=true
EOF

chmod +x ~/Desktop/Chrome-Debug.desktop
```

### Automatisierungs-Script

**Script erstellen:**
```bash
cat > ~/start-chrome-debug.sh << 'EOF'
#!/bin/bash
# Chrome Debug Starter für MCP Screenshot Server

echo "🔄 Stoppe bestehende Chrome-Instanzen..."
pkill -f google-chrome
sleep 2

echo "🚀 Starte Chrome mit Debugging..."
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug-session \
  --no-first-run \
  > /dev/null 2>&1 &

sleep 3

echo "🧪 Teste Debugging-Verbindung..."
if curl -s http://localhost:9222/json/version > /dev/null; then
    echo "✅ Chrome Debugging aktiv!"
    echo "📱 Du kannst jetzt VS Code verwenden."
else
    echo "❌ Chrome Debugging nicht erreichbar."
    echo "🔄 Versuche Chrome manuell zu starten."
fi
EOF

chmod +x ~/start-chrome-debug.sh
```

**Verwendung:**
```bash
~/start-chrome-debug.sh
```

## 📚 Technische Details

### Was passiert intern?

1. **Chrome Debugging Protocol (CDP)** wird auf Port 9222 aktiviert
2. **MCP Server** verbindet sich via `puppeteer.connect()` zu Chrome
3. **Bestehende Tabs** werden wiederverwendet (Session bleibt erhalten)
4. **Screenshots** werden aus der eingeloggten Session gemacht

### Warum diese Flags?

- `--remote-debugging-port=9222`: Aktiviert CDP auf Port 9222
- `--user-data-dir=/tmp/chrome-debug-session`: Separates Profil für Debugging
- `--no-first-run`: Überspringt Setup-Wizard
- `--disable-default-apps`: Weniger Hintergrund-Apps

## 🛡️ Sicherheitshinweise

- **Remote Debugging** ist ein Sicherheitsrisiko → Nur lokal verwenden
- **Temporäres User-Dir** wird verwendet → Session-Daten nicht permanent
- **Port 9222** ist nur auf localhost gebunden → Kein externer Zugriff
- Nach der Arbeit Chrome normal neu starten für reguläre Nutzung

## 📞 Support

Bei Problemen:
1. **Chrome-Prozesse prüfen:** `ps aux | grep chrome`
2. **Port-Status prüfen:** `netstat -tlnp | grep 9222`  
3. **VS Code Output checken:** View → Output → "MCP"
4. **Von Schritt 1 neu beginnen**