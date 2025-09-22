const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const ytdlp = require('yt-dlp-exec');
const fs = require('fs-extra');
const path = require('path');

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
