const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const ytdlp = require('yt-dlp-exec');
const fs = require('fs-extra');
const path = require('path');

// Webp dönüştürme için sharp ekle
const sharp = require('sharp');

console.log('DEBUG: Bot dosyası başlatıldı.');

// Create videos directory
const videosDir = './videos';
fs.ensureDirSync(videosDir);

// URL pattern matching
const urlPatterns = {
    youtube: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:shorts\/|watch\?v=|embed\/|v\/|e\/|user\/|c\/|channel\/|playlist\?list=)?([a-zA-Z0-9_-]{11})|youtu\.be\/([a-zA-Z0-9_-]{11}))/,
    instagram: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|tv|reel|share\/reel)\/([A-Za-z0-9_-]+)/,
    tiktok: /(?:https?:\/\/)?(?:(?:www\.)?tiktok\.com\/@[^\/]+\/video\/\d+|vt\.tiktok\.com\/[A-Za-z0-9_-]+)/,
    twitter: /(?:https?:\/\/)?(?:www\.)?(?:twitter|x)\.com\/(?:i\/web|\w+)\/status\/(\d+)/,
    facebook: /(?:https?:\/\/)?(?:www\.)?facebook\.com\/(?:watch\/\?v=|\w+\/videos\/|reel\/|story\.php\?story_fbid=)([0-9]+)/,
    vimeo: /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/,
    dailymotion: /(?:https?:\/\/)?(?:www\.)?dai(?:ly)?motion\.com\/(?:video|shorts)\/([a-zA-Z0-9]+)/,
    pinterest: /(?:https?:\/\/)?(?:www\.)?pinterest\.com\/pin\/(\d+)/,
    reddit: /(?:https?:\/\/)?(?:www\.)?reddit\.com\/r\/[^\/]+\/comments\/([a-zA-Z0-9]+)/,
    likee: /(?:https?:\/\/)?(?:www\.)?likee\.video\/v\/([a-zA-Z0-9]+)/,
    kwai: /(?:https?:\/\/)?(?:www\.)?kwai\.com\/video\/([a-zA-Z0-9]+)/
};

async function downloadVideo(url, platform) {
    try {
        console.log(`Downloading ${platform} video from: ${url}`);
        
        // Generate unique filename
        const timestamp = Date.now();
        const outputPath = path.join(videosDir, `${platform}_${timestamp}.%(ext)s`);
        
        // Download video using yt-dlp
        await ytdlp(url, {
            output: outputPath,
            format: 'best[height<=720]/best', // Optimize for WhatsApp
            maxFilesize: '50M', // WhatsApp file size limit
        });
        
        // Find the downloaded file
        const files = await fs.readdir(videosDir);
        const downloadedFile = files.find(file => file.startsWith(`${platform}_${timestamp}`));
        
        if (downloadedFile) {
            const filePath = path.join(videosDir, downloadedFile);
            return filePath;
        }
        
        return null;
    } catch (error) {
        console.error(`Error downloading ${platform} video:`, error);
        return null;
    }
}

function detectVideoUrl(text) {
    if (!text) return null;
    
    for (const [platform, pattern] of Object.entries(urlPatterns)) {
        if (pattern.test(text)) {
            const match = text.match(pattern);
            if (match) {
                return {
                    platform,
                    url: match[0].startsWith('http') ? match[0] : `https://${match[0]}`
                };
            }
        }
    }
    return null;
}

async function startBot() {
    console.log('DEBUG: startBot fonksiyonu çağrıldı.');
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true // QR kodu otomatik terminalde göster
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        console.log('DEBUG: connection.update', update);
        if (qr) {
            qrcode.generate(qr, { small: true });
            console.log('Scan the QR code above to connect your WhatsApp');
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log('Connection closed due to', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ Bot başarıyla whatsappa bağlandı!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Her mesajı sadece bir kez işlemek için işlenen mesaj ID'lerini tutan bir Set
    const processedMessageIds = new Set();

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        console.log('DEBUG: Yeni mesaj geldi:', msg);
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        // Mesaj daha önce işlendi mi kontrol et
        const messageId = msg.key.id;
        if (processedMessageIds.has(messageId)) {
            console.log('DEBUG: Bu mesaj zaten işlendi, atlanıyor:', messageId);
            return;
        }
        processedMessageIds.add(messageId);

        const messageText = msg.message.conversation || 
            msg.message.extendedTextMessage?.text || 
            msg.message.imageMessage?.caption || 
            msg.message.videoMessage?.caption;
        if (!messageText) return;
        const detectedVideo = detectVideoUrl(messageText);
        if (detectedVideo) {
            console.log(`Detected ${detectedVideo.platform} link in chat:`, detectedVideo.url);
            try {
                let downloadingMsg = '🎬 Video indiriliyor...';
                await sock.sendMessage(msg.key.remoteJid, {
                    text: downloadingMsg
                }, { quoted: msg });
                const videoPath = await downloadVideo(detectedVideo.url, detectedVideo.platform);
                if (videoPath) {
                    const stats = await fs.stat(videoPath);
                    const fileSizeInMB = stats.size / (1024 * 1024);
                    if (fileSizeInMB > 50) {
                        await sock.sendMessage(msg.key.remoteJid, {
                            text: `❌ Video çok büyük (${fileSizeInMB.toFixed(1)}MB). WhatsApp sınırı 50MB.`
                        }, { quoted: msg });
                    } else {
                        const videoBuffer = await fs.readFile(videoPath);
                        await sock.sendMessage(msg.key.remoteJid, {
                            video: videoBuffer,
                            caption: `✅ Video indirildi!`,
                            mimetype: 'video/mp4'
                        }, { quoted: msg });
                        console.log(`✅ Şu platformdan video indirildi: ${detectedVideo.platform}`);
                    }
                    await fs.remove(videoPath);
                } else {
                    await sock.sendMessage(msg.key.remoteJid, {
                        text: `❌ Şu platformdan video indirilemedi: ${detectedVideo.platform}. The link might be private or unavailable.`
                    }, { quoted: msg });
                }
                return;
            } catch (error) {
                console.error('Error processing video:', error);
                await sock.sendMessage(msg.key.remoteJid, {
                    text: `❌ Videoyu indirirken bir hata oluştu: ${error.message}`
                }, { quoted: msg });
                return;
            }
        } else if (messageText.trim().toLowerCase().startsWith('/qm')) {
            // /qm komutu: Alıntılanan metni WhatsApp mesajı gibi sticker yap (pushName ve profil foto ile)
            const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
            const quotedKey = msg.message.extendedTextMessage?.contextInfo?.stanzaId;
            const quotedParticipant = msg.message.extendedTextMessage?.contextInfo?.participant;
            const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;
            // pushName ve profil foto
            let pushName = 'Kullanıcı';
            let profileImgData = '';
            try {
                if (quotedParticipant) {
                    let contact = undefined;
                    let profileUrl = '';
                    let triedSources = [];
                    // store desteği varsa kullan
                    if (global.store && global.store.contacts) {
                        contact = global.store.contacts[quotedParticipant];
                        if (contact && contact.name) { pushName = contact.name; triedSources.push('store.name'); }
                        else if (contact && contact.notify) { pushName = contact.notify; triedSources.push('store.notify'); }
                        else if (contact && contact.vname) { pushName = contact.vname; triedSources.push('store.vname'); }
                        if (global.store.fetchProfilePictureUrl) {
                            try {
                                profileUrl = await global.store.fetchProfilePictureUrl(quotedParticipant, 'image');
                                if (profileUrl) triedSources.push('store.profilePictureUrl');
                            } catch (e) { console.error('Profil foto fetch error:', e); }
                        }
                    }
                    // store yoksa sock ile devam et
                    if (!profileUrl && sock.profilePictureUrl) {
                        try {
                            profileUrl = await sock.profilePictureUrl(quotedParticipant, 'image');
                            if (profileUrl) triedSources.push('sock.profilePictureUrl');
                        } catch (e) { console.error('Profil foto sock error:', e); }
                    }
                    // Zorla: sock.profilePictureUrl ile tekrar dene (en son çare, hem 'image' hem 'preview')
                    if (!profileUrl && sock.profilePictureUrl) {
                        try {
                            profileUrl = await sock.profilePictureUrl(quotedParticipant, 'preview');
                            if (profileUrl) triedSources.push('sock.profilePictureUrl-preview');
                        } catch (e) { console.error('Profil foto sock preview error:', e); }
                    }
                    // Son çare: WhatsApp'ın default avatarı (bağlantı)
                    if (!profileUrl) {
                        profileUrl = 'https://static.whatsapp.net/rsrc.php/v3/yz/r/36B424nhi3L.png';
                        triedSources.push('default-wa-avatar');
                    }
                    // pushName fallback: sock.contacts
                    if ((!pushName || pushName === 'Kullanıcı') && sock.contacts?.[quotedParticipant]) {
                        let c = sock.contacts[quotedParticipant];
                        if (c.pushName) { pushName = c.pushName; triedSources.push('sock.contacts.pushName'); }
                        else if (c.notify) { pushName = c.notify; triedSources.push('sock.contacts.notify'); }
                        else if (c.name) { pushName = c.name; triedSources.push('sock.contacts.name'); }
                        else if (c.vname) { pushName = c.vname; triedSources.push('sock.contacts.vname'); }
                    }
                    // pushName fallback: sock.getName
                    if ((!pushName || pushName === 'Kullanıcı') && sock.getName) {
                        try {
                            const name = await sock.getName(quotedParticipant);
                            if (name) { pushName = name; triedSources.push('sock.getName'); }
                        } catch (e) { console.error('getName error:', e); }
                    }
                    // pushName fallback: JID
                    if (!pushName || pushName === 'Kullanıcı') {
                        pushName = quotedParticipant.split('@')[0];
                        triedSources.push('jid');
                    }
                    // Eğer pushName sadece rakam/id ise, 'Kullanıcı' olarak gösterme, gerçek isim varsa kullan
                    if (/^\d{8,}$/.test(pushName) && (!contact || (!contact.name && !contact.notify && !contact.vname))) {
                        pushName = 'Kullanıcı';
                        triedSources.push('fallback:onlyId');
                    }
                    // profil foto base64
                    if (profileUrl) {
                        try {
                            const axios = require('axios');
                            const resp = await axios.get(profileUrl, { responseType: 'arraybuffer' });
                            const imgBase64 = Buffer.from(resp.data, 'binary').toString('base64');
                            profileImgData = `data:image/jpeg;base64,${imgBase64}`;
                        } catch (e) { console.error('Profil foto indirilemedi:', e); }
                    }
                    console.log('DEBUG: /qm pushName:', pushName, '| tried:', triedSources, '| profileUrl:', profileUrl);
                    if (!profileImgData) {
                        // fallback: SVG default user icon
                        profileImgData = '';
                    }
                }
            } catch (err) { console.error('pushName/profile hata:', err); }
            const now = new Date();
            const hour = now.getHours().toString().padStart(2, '0');
            const min = now.getMinutes().toString().padStart(2, '0');
            const timeStr = `${hour}:${min}`;
            if (!quoted || !quotedText) {
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Lütfen bir metin mesajını alıntılayıp /qm yazın.' }, { quoted: msg });
                return;
            }
            // SVG ile WhatsApp mesajı gibi sticker oluştur
            try {
                const safeText = quotedText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                // Satırları böl
                const lines = safeText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                // Satır başına max 32 karakterde böl
                let wrapped = [];
                for (const line of lines) {
                    let l = line;
                    while (l.length > 32) {
                        wrapped.push(l.slice(0,32));
                        l = l.slice(32);
                    }
                    if (l) wrapped.push(l);
                }
                if (wrapped.length === 0) wrapped = [' '];
                // Yükseklik hesapla
                const bubbleHeight = 40 + wrapped.length * 38;
                // Profil foto SVG
                let profileImgSvg = '';
                if (profileImgData) {
                    profileImgSvg = `<clipPath id='clipCircle'><circle cx='70' cy='90' r='28'/></clipPath><image x='42' y='62' width='56' height='56' xlink:href='${profileImgData}' clip-path='url(#clipCircle)'/>`;
                }
                // Sadece profil fotoğrafı hiç alınamazsa kullanıcı ikonu göster
                if (!profileImgData) {
                    profileImgSvg = `<clipPath id='clipCircle'><circle cx='70' cy='90' r='28'/></clipPath><image x='42' y='62' width='56' height='56' xlink:href='https://static.whatsapp.net/rsrc.php/v3/yz/r/36B424nhi3L.png' clip-path='url(#clipCircle)'/>`;
                    console.error('Profil fotoğrafı bulunamadı, WhatsApp default avatar gösteriliyor. profileUrl:', profileUrl);
                }
                                                                // msg.pushName varsa onu kullan, yoksa resolved pushName
                                                                                                const stickerName = msg.pushName || pushName;
                                                                                                console.log('DEBUG: SVG stickerName kullanılacak:', stickerName);
                                                                                                                // İsim kutusu için kelime bazlı satır kaydırma, sınırsız satır
                                                                                                                function wrapText(text, maxLen) {
                                                                                                                    const words = text.split(' ');
                                                                                                                    let lines = [];
                                                                                                                    let line = '';
                                                                                                                    for (const word of words) {
                                                                                                                        if ((line + (line ? ' ' : '') + word).length > maxLen) {
                                                                                                                            if (line) lines.push(line);
                                                                                                                            line = word;
                                                                                                                        } else {
                                                                                                                            line += (line ? ' ' : '') + word;
                                                                                                                        }
                                                                                                                    }
                                                                                                                    if (line) lines.push(line);
                                                                                                                    return lines;
                                                                                                                }
                                                                                                                const nameWrapLen = 18;
                                                                                                                const nameLines = wrapText(stickerName, nameWrapLen);
                                                                                                                const nameBoxWidth = Math.max(120, Math.min(340, 32 + Math.max(...nameLines.map(l => l.length)) * 18));
                                                                                                                const nameBoxHeight = 20 + nameLines.length * 28;
                                                                                                                const nameBoxX = 256 - nameBoxWidth / 2;
                                                                                                                const nameBoxY = 22;
                                                                                                                const svg = `
                                                                                <svg width='512' height='512' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'>
                                                                                    <rect width='100%' height='100%' fill='#ece5dd'/>
                                                                                    <rect x='${nameBoxX}' y='${nameBoxY}' rx='14' ry='14' width='${nameBoxWidth}' height='${nameBoxHeight}' fill='#d1f0e2'/>
                                                                                    ${nameLines.map((line, i) => `<text x='256' y='${nameBoxY + 20 + (i+1)*24}' font-size='22' font-family='Arial' fill='#075e54' font-weight='bold' text-anchor='middle'>${line}</text>`).join('')}
                                                                                    <g>
                                                                                        ${profileImgSvg}
                                                                                        <rect x='40' y='60' rx='28' ry='28' width='432' height='${bubbleHeight}' fill='#dcf8c6' />
                                                                                        ${wrapped.map((t,i)=>`<text x='60' y='${130+i*38}' font-size='30' font-family='Arial' fill='#222'>${t}</text>`).join('')}
                                                                                        <text x='420' y='${bubbleHeight+50}' font-size='22' font-family='Arial' fill='#888'>${timeStr}</text>
                                                                                    </g>
                                                                                </svg>`;
                const webpBuffer = await sharp(Buffer.from(svg)).webp({ quality: 95 }).toBuffer();
                await sock.sendMessage(msg.key.remoteJid, { sticker: webpBuffer, mimetype: 'image/webp' }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(msg.key.remoteJid, { text: `❌ Metin çıkartması oluşturulamadı. Hata: ${err?.message || err}` }, { quoted: msg });
            }
            return;
        } else if (messageText.trim().toLowerCase().startsWith('/qm')) {
            // /qm komutu: Alıntılanan metni WhatsApp mesajı gibi sticker yap
            const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
            const quotedKey = msg.message.extendedTextMessage?.contextInfo?.stanzaId;
            const quotedParticipant = msg.message.extendedTextMessage?.contextInfo?.participant;
            const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;
            const senderName = msg.message.extendedTextMessage?.contextInfo?.participant || 'Kullanıcı';
            const displayName = (msg.message.extendedTextMessage?.contextInfo?.participant || '').split('@')[0] || 'Kullanıcı';
            const now = new Date();
            const hour = now.getHours().toString().padStart(2, '0');
            const min = now.getMinutes().toString().padStart(2, '0');
            const timeStr = `${hour}:${min}`;
            if (!quoted || !quotedText) {
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Lütfen bir metin mesajını alıntılayıp /qm yazın.' }, { quoted: msg });
                return;
            }
            // SVG ile WhatsApp mesajı gibi sticker oluştur
            try {
                const safeText = quotedText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                // Satırları böl
                const lines = safeText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                // Satır başına max 32 karakterde böl
                let wrapped = [];
                for (const line of lines) {
                    let l = line;
                    while (l.length > 32) {
                        wrapped.push(l.slice(0,32));
                        l = l.slice(32);
                    }
                    if (l) wrapped.push(l);
                }
                if (wrapped.length === 0) wrapped = [' '];
                // Yükseklik hesapla
                const bubbleHeight = 40 + wrapped.length * 38;
                const svg = `
<svg width='512' height='512' xmlns='http://www.w3.org/2000/svg'>
  <rect width='100%' height='100%' fill='#ece5dd'/>
  <g>
    <rect x='40' y='60' rx='28' ry='28' width='432' height='${bubbleHeight}' fill='#dcf8c6' />
    <text x='60' y='95' font-size='28' font-family='Arial' fill='#075e54' font-weight='bold'>${displayName}</text>
    ${wrapped.map((t,i)=>`<text x='60' y='${130+i*38}' font-size='30' font-family='Arial' fill='#222'>${t}</text>`).join('')}
    <text x='420' y='${bubbleHeight+50}' font-size='22' font-family='Arial' fill='#888'>${timeStr}</text>
  </g>
</svg>`;
                const webpBuffer = await sharp(Buffer.from(svg)).webp({ quality: 95 }).toBuffer();
                await sock.sendMessage(msg.key.remoteJid, { sticker: webpBuffer, mimetype: 'image/webp' }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(msg.key.remoteJid, { text: `❌ Metin çıkartması oluşturulamadı. Hata: ${err?.message || err}` }, { quoted: msg });
            }
            return;
        } else if (messageText.trim().toLowerCase().startsWith('/qm')) {
            // /qm komutu: Alıntılanan metni çıkartma yap
            const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
            const quotedKey = msg.message.extendedTextMessage?.contextInfo?.stanzaId;
            const quotedParticipant = msg.message.extendedTextMessage?.contextInfo?.participant;
            const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;
            if (!quoted || !quotedText) {
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Lütfen bir metin mesajını alıntılayıp /qm yazın.' }, { quoted: msg });
                return;
            }
            // Metni görsele dönüştür ve sticker olarak gönder
            try {
                // Basit bir arka plan ve yazı ile sticker oluştur
                const svg = `<svg width='512' height='512' xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' fill='#fff'/><text x='50%' y='50%' font-size='36' font-family='Arial' fill='#222' text-anchor='middle' dominant-baseline='middle'>${quotedText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</text></svg>`;
                const webpBuffer = await sharp(Buffer.from(svg)).webp({ quality: 90 }).toBuffer();
                await sock.sendMessage(msg.key.remoteJid, { sticker: webpBuffer, mimetype: 'image/webp' }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(msg.key.remoteJid, { text: `❌ Metin çıkartması oluşturulamadı. Hata: ${err?.message || err}` }, { quoted: msg });
            }
            return;
        } else if (messageText.trim().toLowerCase().startsWith('/q')) {
            // /q komutu: Sadece bir fotoğraf alıntılandığında çalışır
            const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
            const quotedKey = msg.message.extendedTextMessage?.contextInfo?.stanzaId;
            const quotedParticipant = msg.message.extendedTextMessage?.contextInfo?.participant;
            if (!quoted || !quoted.imageMessage) {
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Lütfen bir fotoğrafı alıntılayıp /q yazın.' }, { quoted: msg });
                return;
            }
            // Fotoğrafı indir ve webp'ye dönüştür
            try {
                const buffer = await downloadMediaMessage({
                    key: { id: quotedKey, remoteJid: msg.key.remoteJid, fromMe: false, participant: quotedParticipant },
                    message: quoted
                }, 'buffer');
                if (!buffer) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Fotoğraf indirilemedi.' }, { quoted: msg });
                    return;
                }
                // Webp'ye dönüştür
                let webpBuffer;
                try {
                    webpBuffer = await sharp(buffer).resize(512, 512, { fit: 'inside' }).webp({ quality: 80 }).toBuffer();
                } catch (sharpErr) {
                    await sock.sendMessage(msg.key.remoteJid, { text: `❌ Görsel webp'ye dönüştürülemedi. Hata: ${sharpErr?.message || sharpErr}` }, { quoted: msg });
                    return;
                }
                await sock.sendMessage(msg.key.remoteJid, { sticker: webpBuffer, mimetype: 'image/webp' }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(msg.key.remoteJid, { text: `❌ Çıkartma oluşturulamadı. Hata: ${err?.message || err}` }, { quoted: msg });
            }
            return;
        } else if (messageText.trim().toLowerCase().startsWith('/kick')) {
            // /kick komutu: Sadece grup sohbetlerinde çalışır
        } else if (messageText.trim().toLowerCase().startsWith('/lockall')) {
            // /lockall komutu: Sadece grup sohbetlerinde çalışır
            if (!msg.key.remoteJid.endsWith('@g.us')) {
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Bu komut sadece grup sohbetlerinde kullanılabilir.' }, { quoted: msg });
                return;
            }
            // Sadece adminler kullanabilsin
            const groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
            const senderId = (msg.key.participant || msg.key.remoteJid.split('@')[0] + '@s.whatsapp.net');
            // Tüm olası sender JID formatlarını kontrol et
            const senderIds = [
                senderId,
                senderId.replace('@s.whatsapp.net', '@lid'),
                senderId.replace('@s.whatsapp.net', '@c.us')
            ];
            let isAdmin = false;
            for (const id of senderIds) {
                const senderParticipant = groupMetadata.participants.find(p => p.id === id);
                if (senderParticipant && (senderParticipant.admin === true || senderParticipant.admin === 'admin' || senderParticipant.admin === 'superadmin' || senderParticipant.isAdmin === true || senderParticipant.isSuperAdmin === true)) {
                    isAdmin = true;
                    break;
                }
            }
            if (!isAdmin) {
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Sadece grup yöneticileri bu komutu kullanabilir.' }, { quoted: msg });
                return;
            }
            // Grubu sadece yöneticilere aç
            try {
                await sock.groupSettingUpdate(msg.key.remoteJid, 'announcement');
                await sock.sendMessage(msg.key.remoteJid, { text: '🔒 Grup sadece yöneticilere yazılabilir olarak kilitlendi.' }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(msg.key.remoteJid, { text: `❌ Grup kilitlenemedi. Hata: ${err?.message || err}` }, { quoted: msg });
            }
            return;
        } else if (messageText.trim().toLowerCase().startsWith('/unlock')) {
            // /unlock komutu: Sadece grup sohbetlerinde çalışır
            if (!msg.key.remoteJid.endsWith('@g.us')) {
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Bu komut sadece grup sohbetlerinde kullanılabilir.' }, { quoted: msg });
                return;
            }
            // Sadece adminler kullanabilsin
            const groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
            const senderId = (msg.key.participant || msg.key.remoteJid.split('@')[0] + '@s.whatsapp.net');
            const senderIds = [
                senderId,
                senderId.replace('@s.whatsapp.net', '@lid'),
                senderId.replace('@s.whatsapp.net', '@c.us')
            ];
            let isAdmin = false;
            for (const id of senderIds) {
                const senderParticipant = groupMetadata.participants.find(p => p.id === id);
                if (senderParticipant && (senderParticipant.admin === true || senderParticipant.admin === 'admin' || senderParticipant.admin === 'superadmin' || senderParticipant.isAdmin === true || senderParticipant.isSuperAdmin === true)) {
                    isAdmin = true;
                    break;
                }
            }
            if (!isAdmin) {
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Sadece grup yöneticileri bu komutu kullanabilir.' }, { quoted: msg });
                            await sock.sendMessage(msg.key.remoteJid, { sticker: buffer, mimetype: 'image/webp' }, { quoted: msg });
            }
            // Grubu tekrar herkese aç
            try {
                await sock.groupSettingUpdate(msg.key.remoteJid, 'not_announcement');
                await sock.sendMessage(msg.key.remoteJid, { text: '🔓 Grup tekrar herkese yazılabilir olarak açıldı.' }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(msg.key.remoteJid, { text: `❌ Grup açılamadı. Hata: ${err?.message || err}` }, { quoted: msg });
            }
            return;
            if (!msg.key.remoteJid.endsWith('@g.us')) {
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Bu komut sadece grup sohbetlerinde kullanılabilir.' }, { quoted: msg });
                return;
            }
            // Komut: /kick 905xxxxxxxxx
            const parts = messageText.trim().split(/\s+/);
            if (parts.length < 2) {
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Lütfen atmak istediğiniz kişinin numarasını yazın. Örnek: /kick 905xxxxxxxxx' }, { quoted: msg });
                return;
            }
            let phone = parts[1].replace(/[^0-9]/g, '');
            if (phone.length < 10) {
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Geçerli bir numara girin. Örnek: /kick 905xxxxxxxxx' }, { quoted: msg });
                return;
            }
            if (!phone.startsWith('90')) phone = '90' + phone; // Türkiye için
            const jid = phone + '@s.whatsapp.net';
            // Kullanıcıyı gruptan at
            try {
                await sock.groupParticipantsUpdate(msg.key.remoteJid, [jid], 'remove');
                await sock.sendMessage(msg.key.remoteJid, { text: `✅ ${phone} numaralı kullanıcı gruptan atıldı.` }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(msg.key.remoteJid, { text: `❌ Kullanıcı atılamadı. Hata: ${err?.message || err}` }, { quoted: msg });
            }
            return;
        }
    });
    return sock;
}

// Start the bot
console.log('🚀 Bot Başlatılıyor...(Bitirmek için CTRL+C)');
startBot().catch((err) => {
    console.error('DEBUG: startBot hata:', err);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Bot kapanıyor...');
    fs.removeSync(videosDir);
    process.exit(0);
});
