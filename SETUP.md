# Setup Guide

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Install Chrome/Chromium

The bot requires Chrome or Chromium browser to run (via Puppeteer).

#### Ubuntu/Debian:
```bash
# Install Chrome
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo dpkg -i google-chrome-stable_current_amd64.deb
sudo apt-get install -f

# Or use system Chromium
sudo apt-get install chromium-browser
export CHROME_BIN=/usr/bin/chromium-browser
```

#### macOS:
```bash
# Install via Homebrew
brew install --cask google-chrome

# Or Chromium
brew install chromium
```

#### Windows:
Download and install Chrome from: https://www.google.com/chrome/

### 3. Configure (Optional)

Create a `.env` file or export environment variables:

```bash
# Set bot owner (admin)
export OWNER_JID="905xxxxxxxxx@c.us"

# Set additional admins (comma-separated)
export ADMIN_JIDS="905xxxxxxxxx@c.us,905yyyyyyyyy@c.us"

# Set custom Chrome path (if needed)
export CHROME_BIN="/usr/bin/google-chrome"
```

Or create `settings.json`:
```json
{
  "adminJids": ["905xxxxxxxxx@c.us"],
  "maxFileSizeMB": 50
}
```

### 4. Start the Bot
```bash
npm start
```

### 5. Authenticate with WhatsApp

1. A QR code will appear in the terminal
2. Open WhatsApp on your phone
3. Go to **Settings** → **Linked Devices**
4. Tap **"Link a Device"**
5. Scan the QR code

The bot will save authentication data in `.wwebjs_auth/` directory for automatic reconnection.

## Troubleshooting

### Chrome/Chromium Not Found

If you get an error about Chrome not being found:

1. Find your Chrome installation:
   ```bash
   # Linux
   which google-chrome
   which chromium-browser
   
   # macOS
   which google-chrome
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome
   ```

2. Set the `CHROME_BIN` environment variable:
   ```bash
   export CHROME_BIN="/path/to/chrome"
   npm start
   ```

### Puppeteer Download Issues

If Puppeteer fails to download Chrome automatically, install it manually (see step 2 above) and set `CHROME_BIN`.

### Authentication Issues

If QR code doesn't appear or authentication fails:

1. Delete the `.wwebjs_auth/` directory
2. Restart the bot
3. Scan the new QR code

### Port Conflicts

If the bot fails to start due to port conflicts, make sure no other WhatsApp Web instances are running.

## Development

### Running in Development Mode
```bash
npm run dev
```

This uses `nodemon` to automatically restart the bot when files change.

### Logs

All messages are logged to `./logs/` directory, organized by date (YYYY-MM-DD.log).

### Backups

Automatic backups are created weekly (Sundays at 3 AM) in the `./backups/` directory.

Manual backup: Send `/backup` or `/yedekle` command to the bot (admin only).

## Production Deployment

### Using PM2 (Recommended)

```bash
# Install PM2
npm install -g pm2

# Start bot
pm2 start bot.js --name whatsapp-bot

# Enable auto-restart on system boot
pm2 startup
pm2 save
```

### Using Docker

```dockerfile
FROM node:18

# Install Chrome dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN=/usr/bin/chromium

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t whatsapp-bot .
docker run -it --rm -v $(pwd)/.wwebjs_auth:/app/.wwebjs_auth whatsapp-bot
```

### Using Systemd (Linux)

Create `/etc/systemd/system/whatsapp-bot.service`:

```ini
[Unit]
Description=WhatsApp Video Bot
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/whatsapp-video-bot
Environment="CHROME_BIN=/usr/bin/google-chrome"
ExecStart=/usr/bin/node bot.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable whatsapp-bot
sudo systemctl start whatsapp-bot
sudo systemctl status whatsapp-bot
```

## Commands Reference

### Admin Commands
- `/backup` or `/yedekle` - Create manual backup
- `/blacklist <jid>` - Block user/group
- `/unblacklist <jid>` - Unblock user/group  
- `/maksimumdosyasınırı <MB>` - Set max file size

### Group Commands (Admin/Group Admin only)
- `/kick <phone>` - Remove member
- `/lockall` - Lock group (admins only)
- `/unlock` - Unlock group

### User Commands
- Send a video URL - Download and receive video
- `/q` - Reply to image to create sticker
- `/qm` or `/çıkar` - Reply to text to create text sticker

## Supported Platforms

Videos can be downloaded from:
- YouTube
- Instagram
- TikTok
- Twitter/X
- Facebook
- Vimeo
- Dailymotion
- Pinterest
- Reddit
- And many more (via yt-dlp)
