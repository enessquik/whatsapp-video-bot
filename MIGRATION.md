# Migration from Baileys to whatsapp-web.js

This document describes the migration from `@whiskeysockets/baileys` to `whatsapp-web.js`.

## Summary of Changes

### 1. Dependencies Updated

**Removed:**
- `@whiskeysockets/baileys` (6.6.0)

**Added:**
- `whatsapp-web.js` (^1.23.0) - WhatsApp Web API client
- `qrcode` (^1.5.3) - QR code generation (was missing in original)
- `sharp` (^0.33.0) - Image processing (was missing in original)
- `node-cron` (^3.0.3) - Task scheduling (was missing in original)
- `archiver` (^6.0.1) - ZIP archiving (was missing in original)
- `axios` (^1.6.0) - HTTP client (was missing in original)

### 2. Authentication Changes

**Before (Baileys):**
```javascript
const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
const sock = makeWASocket({ auth: state });
sock.ev.on('creds.update', saveCreds);
```

**After (whatsapp-web.js):**
```javascript
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});
await client.initialize();
```

**Storage:**
- Baileys: `./auth_info/` directory
- whatsapp-web.js: `./.wwebjs_auth/` directory (handled automatically by LocalAuth)

### 3. Connection & QR Code

**Before (Baileys):**
```javascript
sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
        qrcode.toString(qr, { type: 'terminal', small: true })
            .then(qrStr => console.log(qrStr));
    }
    if (connection === 'close') {
        // Handle reconnection
    }
});
```

**After (whatsapp-web.js):**
```javascript
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Bot connected!');
});

client.on('disconnected', (reason) => {
    console.log('Disconnected:', reason);
});
```

### 4. Message Handling

**Before (Baileys):**
```javascript
sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    const messageText = msg.message.conversation || 
                       msg.message.extendedTextMessage?.text;
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
});
```

**After (whatsapp-web.js):**
```javascript
client.on('message', async (msg) => {
    const messageText = msg.body;
    const from = msg.from;
    const sender = msg.author || msg.from;
});
```

### 5. Sending Messages

**Before (Baileys):**
```javascript
await sock.sendMessage(msg.key.remoteJid, { 
    text: 'Hello!' 
}, { quoted: msg });
```

**After (whatsapp-web.js):**
```javascript
await msg.reply('Hello!');
// or
await client.sendMessage(msg.from, 'Hello!');
```

### 6. Media Handling

**Before (Baileys):**
```javascript
// Send media
const videoBuffer = await fs.readFile(videoPath);
await sock.sendMessage(msg.key.remoteJid, {
    video: videoBuffer,
    caption: 'Video!',
    mimetype: 'video/mp4'
});

// Download media
const buffer = await downloadMediaMessage(msg, 'buffer');
```

**After (whatsapp-web.js):**
```javascript
// Send media
const media = MessageMedia.fromFilePath(videoPath);
await client.sendMessage(msg.from, media, { caption: 'Video!' });

// Download media
const media = await msg.downloadMedia();
const buffer = Buffer.from(media.data, 'base64');
```

### 7. Sticker Handling

**Before (Baileys):**
```javascript
const webpBuffer = await sharp(buffer).webp({ quality: 80 }).toBuffer();
await sock.sendMessage(msg.key.remoteJid, { 
    sticker: webpBuffer, 
    mimetype: 'image/webp' 
});
```

**After (whatsapp-web.js):**
```javascript
const webpBuffer = await sharp(buffer).webp({ quality: 80 }).toBuffer();
const media = new MessageMedia('image/webp', webpBuffer.toString('base64'));
await client.sendMessage(msg.from, media, { sendMediaAsSticker: true });
```

### 8. Quoted Messages

**Before (Baileys):**
```javascript
const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;
const quotedParticipant = msg.message.extendedTextMessage?.contextInfo?.participant;
```

**After (whatsapp-web.js):**
```javascript
if (msg.hasQuotedMsg) {
    const quotedMsg = await msg.getQuotedMessage();
    const quotedText = quotedMsg.body;
    const contact = await quotedMsg.getContact();
}
```

### 9. Group Management

**Before (Baileys):**
```javascript
// Get group metadata
const groupMetadata = await sock.groupMetadata(msg.key.remoteJid);

// Update group settings
await sock.groupSettingUpdate(msg.key.remoteJid, 'announcement');

// Remove participant
await sock.groupParticipantsUpdate(msg.key.remoteJid, [jid], 'remove');
```

**After (whatsapp-web.js):**
```javascript
// Get chat
const chat = await msg.getChat();

// Check if group
if (chat.isGroup) {
    // Update group settings
    await chat.setMessagesAdminsOnly(true);
    
    // Remove participant
    await chat.removeParticipants([jid]);
    
    // Get participants
    const participants = chat.participants;
}
```

### 10. Contact Information

**Before (Baileys):**
```javascript
const pushName = msg.pushName || 'User';
const profileUrl = await sock.profilePictureUrl(jid, 'image');
```

**After (whatsapp-web.js):**
```javascript
const contact = await msg.getContact();
const pushName = contact.pushname || contact.name || 'User';
const profileUrl = await contact.getProfilePicUrl();
```

### 11. JID Format Changes

**Baileys:**
- Private chats: `905xxxxxxxxx@s.whatsapp.net`
- Groups: `120363401359968775@g.us`

**whatsapp-web.js:**
- Private chats: `905xxxxxxxxx@c.us`
- Groups: `120363401359968775@g.us` (groups remain the same)

### 12. Event Structure

| Event | Baileys | whatsapp-web.js |
|-------|---------|-----------------|
| Connection | `connection.update` | `qr`, `authenticated`, `ready`, `disconnected` |
| Messages | `messages.upsert` | `message`, `message_create` |
| Credentials | `creds.update` | (handled automatically by LocalAuth) |
| Group Updates | `groups.update` | `group_join`, `group_leave`, etc. |

## Breaking Changes

1. **Browser Requirement**: whatsapp-web.js requires Chrome/Chromium via Puppeteer
2. **Session Storage**: Authentication data moved from `./auth_info/` to `./.wwebjs_auth/`
3. **Message Structure**: Complete change in message object structure
4. **Async Operations**: More operations are now async (e.g., `getChat()`, `getContact()`)
5. **JID Format**: Private chat IDs changed from `@s.whatsapp.net` to `@c.us`

## Preserved Features

All original bot features have been preserved:
- ✅ Video downloading from multiple platforms
- ✅ Message logging to daily files
- ✅ Admin and blacklist management
- ✅ Sticker creation from images (`/q`)
- ✅ Sticker creation from text (`/qm`)
- ✅ Group management (`/kick`, `/lockall`, `/unlock`)
- ✅ File size limits
- ✅ Weekly automated backups
- ✅ Manual backup command
- ✅ Settings persistence

## Benefits of Migration

1. **Better Stability**: whatsapp-web.js is more stable and actively maintained
2. **Better Documentation**: More comprehensive API documentation
3. **Easier Development**: More intuitive API design
4. **Better Type Support**: Better TypeScript definitions
5. **Active Community**: Larger community and more examples
6. **Web-based**: Uses WhatsApp Web protocol (more stable than mobile protocol)

## Migration Checklist

- [x] Update dependencies in package.json
- [x] Replace authentication mechanism
- [x] Update message event handlers
- [x] Convert message sending methods
- [x] Update media handling
- [x] Convert group management functions
- [x] Update contact/profile methods
- [x] Update JID normalization
- [x] Test all commands
- [x] Update documentation

## Testing the Migration

To verify all features work:

1. **Authentication**: Bot should display QR code and connect
2. **Video Download**: Send YouTube/Instagram/TikTok link
3. **Stickers**: Reply to image with `/q`, reply to text with `/qm`
4. **Admin Commands**: Test `/backup`, `/blacklist`, `/maksimumdosyasınırı`
5. **Group Commands**: Test `/kick`, `/lockall`, `/unlock` (requires group admin)
6. **Logging**: Check `./logs/` for message logs
7. **Backups**: Check `./backups/` directory

## Troubleshooting

### Chrome Not Found
Install Chrome/Chromium and set `CHROME_BIN` environment variable.

### Session Issues
Delete `.wwebjs_auth/` directory and re-authenticate.

### Old Session Data
Old Baileys sessions in `./auth_info/` are no longer used and can be deleted.

## References

- [whatsapp-web.js Documentation](https://wwebjs.dev/)
- [whatsapp-web.js GitHub](https://github.com/pedroslopez/whatsapp-web.js)
- [Puppeteer Documentation](https://pptr.dev/)
