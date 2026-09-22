# 🚀 Quick Start - MCP Screenshot Server

## Schnellstart in 4 Schritten

### 1️⃣ **Chrome mit Debugging starten**
```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-session &
```

### 2️⃣ **Verbindung testen**  
```bash
curl http://localhost:9222/json/version
```
✅ Sollte Chrome-Info ausgeben

### 3️⃣ **Einloggen**
- Gehe zu: `http://taxtastic.local:8083/wp-login.php`  
- Logge dich ein
- Navigiere zu: `http://taxtastic.local:8083/steuer-profil/`

### 4️⃣ **VS Code aktivieren**
`Cmd+Shift+P` → "Developer: Reload Window"

## ✅ **Fertig!**
Jetzt funktioniert der Screenshot-Befehl mit deiner Login-Session!

---

**💡 Tipp:** Bookmark diese Seite für schnellen Zugriff.

**📖 Vollständige Anleitung:** Siehe `CHROME-SETUP.md` für Details und Troubleshooting.