
# Whatsapp Video Downloader

This is a WhatsApp bot that downloads videos from popular social media links (e.g., Instagram, YouTube, TikTok, and popular adult film sites) and sends them directly to your WhatsApp chat.

## Features

- **Video Downloading**: Automatically detects and downloads videos from various platforms
- **Sticker Creation**: Creates stickers from pictures (usage: reply to a picture with `/q`) and quoted text messages (usage: reply to a text with `/qm`)
- **Blacklist Management**: Block users or groups from using the bot (`/blacklist`, `/unblacklist`)
- **File Size Control**: Adjust maximum download size (`/maksimumdosyasınırı xx`)
- **Automatic Backups**: Weekly automatic backups of bot data (scheduled for Sundays at 3 AM)
- **Manual Backup**: Trigger backup on demand (`/backup` or `/yedekle`)

### Group Management Commands

- **Lock Group**: Restrict messages to admins only (`/lockall`)
- **Unlock Group**: Allow all members to send messages (`/unlock`)
- **Kick Members**: Remove members from the group (`/kick 905xxxxxxxxx`)

### Command Format Notes
If commands with phone numbers don't work, try using the full WhatsApp ID format:
- For private chats: `/command 905xxxxxxxxx@c.us`
- For groups: `/command 120363401359968775@g.us`

## Installation

### Prerequisites
- Node.js (v14 or higher)
- Chrome/Chromium browser (required by whatsapp-web.js)

### Setup

1. Clone the repository:
```bash
git clone https://github.com/enessquik/whatsapp-video-bot.git
cd whatsapp-video-bot
```

2. Install dependencies:
```bash
npm install
```

3. Start the bot:
```bash
npm start
```

4. Scan the QR code with your WhatsApp mobile app:
   - Open WhatsApp on your phone
   - Go to Settings > Linked Devices
   - Tap "Link a Device"
   - Scan the QR code displayed in the terminal

### Configuration

#### Admin Setup
Set bot administrators via environment variables:
```bash
export OWNER_JID="905xxxxxxxxx@c.us"
export ADMIN_JIDS="905xxxxxxxxx@c.us,905yyyyyyyyy@c.us"
```

Or edit the admin list in `settings.json`:
```json
{
  "adminJids": ["905xxxxxxxxx@c.us", "905yyyyyyyyy@c.us"],
  "maxFileSizeMB": 50
}
```

#### Chrome/Chromium Path
If Chrome/Chromium is installed in a custom location, set the path:
```bash
export CHROME_BIN="/path/to/chrome"
```

## Technology Stack

- **whatsapp-web.js**: WhatsApp Web API wrapper
- **yt-dlp**: Universal video downloader
- **sharp**: Image processing for sticker creation
- **node-cron**: Scheduled tasks for automatic backups
- **puppeteer**: Browser automation (used by whatsapp-web.js)

## Migration from Baileys

This bot has been migrated from `@whiskeysockets/baileys` to `whatsapp-web.js` for improved stability and features. All existing functionality has been preserved:
- Video downloading
- Message logging
- Admin and blacklist management
- Sticker creation from images and text
- Group management
- Automated backups

## Special Thanks

- Thanks to [@mang0incc](https://www.github.com/mang0incc) for giving this project a life :)

## Credits

This project has been made by TheCoderinho.  
Main Developer: @enessquik

## License

See LICENSE file for details.

