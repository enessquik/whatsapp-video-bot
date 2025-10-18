// WhatsApp Web.js imports
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const ytdlp = require('yt-dlp-exec');
const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');
const cron = require('node-cron');
const archiver = require('archiver');
const axios = require('axios');

console.log('DEBUG: Bot dosyası başlatıldı.');

// Create videos directory
const videosDir = './videos';
fs.ensureDirSync(videosDir);
// Logs and backups dirs
const logsDir = './logs';
const backupsDir = './backups';
fs.ensureDirSync(logsDir);
fs.ensureDirSync(backupsDir);

function logMessage(msg) {
    try {
        const now = new Date();
        const day = now.toISOString().slice(0,10); // YYYY-MM-DD
        const logfile = path.join(logsDir, `${day}.log`);
        const entry = {
            timestamp: now.toISOString(),
            id: msg.id._serialized || msg.id,
            from: msg.from,
            author: msg.author || null,
            body: msg.body,
            type: msg.type
        };
        fs.appendFileSync(logfile, JSON.stringify(entry) + '\n', 'utf8');
    } catch (e) { console.error('Log yazılamadı:', e); }
}

async function createWeeklyBackup() {
    const now = new Date();
    const name = `backup-${now.toISOString().slice(0,10)}.zip`;
    const outPath = path.join(backupsDir, name);
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', () => resolve(outPath));
        archive.on('error', err => reject(err));
        archive.pipe(output);
        // add folders if they exist
        if (fs.existsSync('.wwebjs_auth')) archive.directory('.wwebjs_auth/', 'wwebjs_auth');
        if (fs.existsSync(logsDir)) archive.directory(logsDir+'/', 'logs');
        if (fs.existsSync(videosDir)) archive.directory(videosDir+'/', 'videos');
        archive.finalize();
    });
}

// Schedule weekly backup: every Sunday at 03:00
cron.schedule('0 3 * * 0', async () => {
    try {
        console.log('Haftalık yedekleme başlatılıyor...');
        const p = await createWeeklyBackup();
        console.log('Yedek oluşturuldu:', p);
    } catch (e) {
        console.error('Yedekleme başarısız:', e);
    }
});

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

// Add common adult site patterns (yt-dlp often supports downloading these)
Object.assign(urlPatterns, {
    pornhub: /(?:https?:\/\/)?(?:www\.)?pornhub\.com\/(?:view_video\.php\?viewkey=|video\/)([a-zA-Z0-9_\-]+)/,
    xvideos: /(?:https?:\/\/)?(?:www\.)?xvideos\.com\/video(\d+)\/?(?:[\w\-]*)/,
    xnxx: /(?:https?:\/\/)?(?:www\.)?xnxx\.com\/(?:video|player)\/(?:[a-zA-Z0-9_\-\/]+)/,
    xhamster: /(?:https?:\/\/)?(?:www\.)?xhamster\.com\/(?:videos)\/(?:[a-zA-Z0-9_\-\/]+)/,
    redtube: /(?:https?:\/\/)?(?:www\.)?redtube\.com\/(?:\w+)\/(\d+)/,
    youporn: /(?:https?:\/\/)?(?:www\.)?youporn\.com\/(?:watch|video)\/(\d+)/
});

async function downloadVideo(url, platform) {
    try {
    console.log(`İndiriliyor (${platform}): ${url}`);
        
        // Generate unique filename
        const timestamp = Date.now();
        const outputPath = path.join(videosDir, `${platform}_${timestamp}.%(ext)s`);
        
        // Download video using yt-dlp; use settings.maxFileSizeMB to help limit downloads
        const maxFilesizeSetting = `${settings.maxFileSizeMB}M`;
        await ytdlp(url, {
            output: outputPath,
            format: 'best[height<=720]/best', // Optimize for WhatsApp
            // pass-through max filesize to yt-dlp as a hint
            maxFilesize: maxFilesizeSetting,
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
        console.error(`İndirme hatası (${platform}):`, error);
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

// Basit dosya tabanlı karaliste
const blacklistFile = path.join(__dirname, 'blacklist.json');
let blacklist = [];

// Basit ayar dosyası (settings)
const settingsFile = path.join(__dirname, 'settings.json');
let settings = {
    maxFileSizeMB: 50 // default 50 MB
};

function loadSettings() {
    try {
        if (fs.existsSync(settingsFile)) {
            const data = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
            settings = Object.assign(settings, data || {});
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
}

function saveSettings() {
    try {
        fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
}

// Load settings on startup
loadSettings();

// Normalize JID helper: accepts full JIDs or phone numbers and returns WhatsApp chat ID string.
function normalizeJid(jid) {
    if (!jid || typeof jid !== 'string') return null;
    jid = jid.trim();
    if (jid.includes('@')) return jid;
    // keep only digits
    const digits = jid.replace(/\D/g, '');
    if (digits.length >= 10) {
        // If it's 10 digits (likely local), assume Turkey country code 90 (project previously used this)
        let normalized = digits;
        if (digits.length === 10 && !digits.startsWith('90')) normalized = '90' + digits;
        return normalized + '@c.us';
    }
    return null;
}

// Owner JID can be provided via environment variable OWNER_JID or edited here.
const OWNER_JID = process.env.OWNER_JID || '905xxxxxxxx@c.us';
const ownerJidNormalized = normalizeJid(OWNER_JID);

try {
    if (fs.existsSync(blacklistFile)) {
        const data = JSON.parse(fs.readFileSync(blacklistFile, 'utf8'));
        if (Array.isArray(data)) {
            blacklist = Array.from(new Set(data.map(normalizeJid).filter(Boolean)));
        } else {
            blacklist = [];
        }
    }
} catch (e) { console.error('Failed to load blacklist:', e); blacklist = []; }

    // Admin list support: from settings.adminJids (array) and env ADMIN_JIDS (comma-separated)
    let adminJids = new Set();
    function loadAdmins() {
        adminJids = new Set();
        // from settings
        if (Array.isArray(settings.adminJids)) {
            settings.adminJids.forEach(j => { const n = normalizeJid(j); if (n) adminJids.add(n); });
        }
        // from env
        if (process.env.ADMIN_JIDS) {
            process.env.ADMIN_JIDS.split(',').map(s => s.trim()).forEach(j => { const n = normalizeJid(j); if (n) adminJids.add(n); });
        }
        // ensure owner is always an admin
        if (ownerJidNormalized) adminJids.add(ownerJidNormalized);
    }

    function isAdmin(senderId) {
        const n = normalizeJid(senderId);
        return !!n && adminJids.has(n);
    }

    // initialize admin list
    loadAdmins();

function saveBlacklist() {
    try {
        fs.writeFileSync(blacklistFile, JSON.stringify(blacklist, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to save blacklist:', e);
    }
}

async function startBot() {
    console.log('DEBUG: startBot fonksiyonu çağrıldı.');
    
    const puppeteerOptions = {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
        headless: true
    };
    
    // Use custom Chrome path if provided via environment variable
    if (process.env.CHROME_BIN) {
        puppeteerOptions.executablePath = process.env.CHROME_BIN;
    }
    
    const client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: puppeteerOptions
    });

    client.on('qr', (qr) => {
        console.log('DEBUG: QR kod oluşturuldu');
        qrcode.generate(qr, { small: true });
        console.log('QR kodunu tarayarak WhatsApp hesabınızı bağlayın');
    });

    client.on('authenticated', () => {
        console.log('DEBUG: Kimlik doğrulandı');
    });

    client.on('auth_failure', (msg) => {
        console.error('Kimlik doğrulama hatası:', msg);
    });

    client.on('ready', () => {
        console.log('✅ Bot başarıyla whatsappa bağlandı!');
    });

    client.on('disconnected', (reason) => {
        console.log('Bağlantı kesildi:', reason);
    });

    // Her mesajı sadece bir kez işlemek için işlenen mesaj ID'lerini tutan bir Set
    const processedMessageIds = new Set();

    client.on('message', async (msg) => {
        console.log('DEBUG: Yeni mesaj geldi:', msg.from);
        
        // Her gelen mesajı logla (günlük dosyalara)
        try { logMessage(msg); } catch (e) { console.error('Log mesajı hata:', e); }
        
        // Karaliste kontrolü (normalize ederek kontrol et)
        const incomingJid = normalizeJid(msg.from) || msg.from;
        if (blacklist.includes(incomingJid)) {
            console.log('DEBUG: Bu sohbet karalistede, mesaj yok sayıldı:', incomingJid);
            return;
        }
        
        // Status broadcast'leri ignore et
        if (msg.from === 'status@broadcast') return;

        // Mesaj daha önce işlendi mi kontrol et
        const messageId = msg.id._serialized || msg.id;
        if (processedMessageIds.has(messageId)) {
            console.log('DEBUG: Bu mesaj zaten işlendi, atlanıyor:', messageId);
            return;
        }
        processedMessageIds.add(messageId);

        const messageText = msg.body || '';
        if (!messageText) return;
        const msgLower = messageText.trim().toLowerCase();
        const cmdIs = (...aliases) => aliases.some(a => msgLower.startsWith(a));
        
        // Admin komutu: /yedekle veya /backup ile anında yedek oluşturma
        if (cmdIs('/yedekle', '/backup')) {
            const sender = msg.author || msg.from;
            if (!isAdmin(sender)) {
                await msg.reply('❌ Bu komutu kullanmak için yetkiniz yok.');
                return;
            }
            await msg.reply('🔄 Yedekleme başlatılıyor...');
            try {
                const p = await createWeeklyBackup();
                await msg.reply(`✅ Yedek tamamlandı: ${p}`);
            } catch (e) {
                console.error('Manuel yedekleme hata:', e);
                await msg.reply(`❌ Yedekleme başarısız: ${e.message}`);
            }
            return;
        }
        
        const detectedVideo = detectVideoUrl(messageText);
        if (detectedVideo) {
            console.log(`Tespit edilen ${detectedVideo.platform} linki:`, detectedVideo.url);
            try {
                await msg.reply('🎬 Video indiriliyor...');
                const videoPath = await downloadVideo(detectedVideo.url, detectedVideo.platform);
                if (videoPath) {
                    const stats = await fs.stat(videoPath);
                    const fileSizeInMB = stats.size / (1024 * 1024);
                    if (fileSizeInMB > settings.maxFileSizeMB) {
                        await msg.reply(`❌ Video çok büyük (${fileSizeInMB.toFixed(1)}MB). İzin verilen maksimum: ${settings.maxFileSizeMB}MB.`);
                    } else {
                        const media = MessageMedia.fromFilePath(videoPath);
                        await client.sendMessage(msg.from, media, { caption: '✅ Video indirildi!' });
                        console.log(`✅ Şu platformdan video indirildi: ${detectedVideo.platform}`);
                    }
                    await fs.remove(videoPath);
                } else {
                    await msg.reply(`❌ Şu platformdan video indirilemedi: ${detectedVideo.platform}. Bağlantı özel, erişilemez veya coğrafi/kısıtlama nedeniyle engellenmiş olabilir.`);
                }
                return;
            } catch (error) {
                console.error('Videoyu işlerken hata:', error);
                await msg.reply(`❌ Videoyu indirirken bir hata oluştu: ${error.message}`);
                return;
            }
        } else if (cmdIs('/qm','/çıkar')) {
            // /qm komutu: Alıntılanan metni WhatsApp mesajı gibi sticker yap
            if (!msg.hasQuotedMsg) {
                await msg.reply('❌ Lütfen bir metin mesajını alıntılayıp /qm yazın.');
                return;
            }
            
            const quotedMsg = await msg.getQuotedMessage();
            const quotedText = quotedMsg.body;
            
            if (!quotedText) {
                await msg.reply('❌ Alıntılanan mesajda metin bulunamadı.');
                return;
            }
            
            // pushName ve profil foto bilgisi
            let pushName = 'Kullanıcı';
            let profileImgData = '';
            
            try {
                const contact = await quotedMsg.getContact();
                if (contact) {
                    pushName = contact.pushname || contact.name || contact.number || 'Kullanıcı';
                    
                    // Profil fotoğrafını al
                    try {
                        const profileUrl = await contact.getProfilePicUrl();
                        if (profileUrl) {
                            const resp = await axios.get(profileUrl, { responseType: 'arraybuffer' });
                            const imgBase64 = Buffer.from(resp.data, 'binary').toString('base64');
                            profileImgData = `data:image/jpeg;base64,${imgBase64}`;
                        }
                    } catch (e) {
                        console.error('Profil foto alınamadı:', e);
                    }
                }
            } catch (err) {
                console.error('pushName/profile hata:', err);
            }
            
            const now = new Date();
            const hour = now.getHours().toString().padStart(2, '0');
            const min = now.getMinutes().toString().padStart(2, '0');
            const timeStr = `${hour}:${min}`;
            
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
                } else {
                    // Default avatar
                    profileImgSvg = `<clipPath id='clipCircle'><circle cx='70' cy='90' r='28'/></clipPath><image x='42' y='62' width='56' height='56' xlink:href='https://static.whatsapp.net/rsrc.php/v3/yz/r/36B424nhi3L.png' clip-path='url(#clipCircle)'/>`;
                }
                
                // İsim kutusu için kelime bazlı satır kaydırma
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
                const nameLines = wrapText(pushName, nameWrapLen);
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
                const media = new MessageMedia('image/webp', webpBuffer.toString('base64'));
                await client.sendMessage(msg.from, media, { sendMediaAsSticker: true });
            } catch (err) {
                await msg.reply(`❌ Metin çıkartması oluşturulamadı. Hata: ${err?.message || err}`);
            }
            return;
        } else if (cmdIs('/q','/foto','/fotoçıkar')) {
            // /q komutu: Sadece bir fotoğraf alıntılandığında çalışır
            if (!msg.hasQuotedMsg) {
                await msg.reply('❌ Lütfen bir fotoğrafı alıntılayıp /q yazın.');
                return;
            }
            
            const quotedMsg = await msg.getQuotedMessage();
            
            if (!quotedMsg.hasMedia || quotedMsg.type !== 'image') {
                await msg.reply('❌ Lütfen bir fotoğrafı alıntılayıp /q yazın.');
                return;
            }
            
            // Fotoğrafı indir ve webp'ye dönüştür
            try {
                const media = await quotedMsg.downloadMedia();
                if (!media) {
                    await msg.reply('❌ Fotoğraf indirilemedi.');
                    return;
                }
                
                const buffer = Buffer.from(media.data, 'base64');
                
                // Webp'ye dönüştür
                let webpBuffer;
                try {
                    webpBuffer = await sharp(buffer).resize(512, 512, { fit: 'inside' }).webp({ quality: 80 }).toBuffer();
                } catch (sharpErr) {
                    await msg.reply(`❌ Görsel webp'ye dönüştürülemedi. Hata: ${sharpErr?.message || sharpErr}`);
                    return;
                }
                
                const stickerMedia = new MessageMedia('image/webp', webpBuffer.toString('base64'));
                await client.sendMessage(msg.from, stickerMedia, { sendMediaAsSticker: true });
            } catch (err) {
                await msg.reply(`❌ Çıkartma oluşturulamadı. Hata: ${err?.message || err}`);
            }
            return;
        } else if (cmdIs('/blacklist','/karaliste')) {
            // Sadece bot sahibi kullanabilsin (örnek: kendi numaranız)
            const senderId = msg.author || msg.from;
            if (!isAdmin(senderId)) {
                await msg.reply('❌ Bu komutu sadece bot yöneticileri kullanabilir.');
                return;
            }
            const parts = messageText.trim().split(/\s+/);
            if (parts.length < 2) {
                await msg.reply('❌ Karalisteye almak için sohbet JID girin. Örnek: /blacklist 120363401359968775@g.us');
                return;
            }
            const jidInput = parts[1];
            const normalizedJ = normalizeJid(jidInput) || jidInput;
            if (!blacklist.includes(normalizedJ)) {
                blacklist.push(normalizedJ);
                saveBlacklist();
                await msg.reply(`✅ ${normalizedJ} karalisteye alındı.`);
            } else {
                await msg.reply(`❌ ${normalizedJ} zaten karalistede.`);
            }
            return;
        } else if (cmdIs('/maksimumdosyasınırı')) {
            // Sadece bot sahibi kullanabilsin
            const senderId3 = msg.author || msg.from;
            if (!isAdmin(senderId3)) {
                await msg.reply('❌ Bu komutu sadece bot yöneticileri kullanabilir.');
                return;
            }
            const parts = messageText.trim().split(/\s+/);
            if (parts.length < 2) {
                await msg.reply(`❌ Lütfen megabayt cinsinden bir sayı girin. Örnek: /maksimumdosyasınırı 50`);
                return;
            }
            const parsed = Number(parts[1]);
            if (Number.isNaN(parsed) || parsed <= 0) {
                await msg.reply(`❌ Geçerli bir pozitif sayı girin. Örnek: /maksimumdosyasınırı 50`);
                return;
            }
            settings.maxFileSizeMB = Math.floor(parsed);
            saveSettings();
            await msg.reply(`✅ Maksimum dosya boyutu ${settings.maxFileSizeMB}MB olarak ayarlandı.`);
            return;
        } else if (cmdIs('/unblacklist','/karalistencikar','/karalistedencikar','/karalisteçikar')) {
            // Sadece bot sahibi kullanabilsin
            const senderId2 = msg.author || msg.from;
            if (!isAdmin(senderId2)) {
                await msg.reply('❌ Bu komutu sadece bot yöneticileri kullanabilir.');
                return;
            }
            const parts = messageText.trim().split(/\s+/);
            if (parts.length < 2) {
                await msg.reply('❌ Karalisteden çıkarmak için sohbet JID girin. Örnek: /unblacklist 120363401359968775@g.us');
                return;
            }
            const jidInput = parts[1];
            const normalizedJ2 = normalizeJid(jidInput) || jidInput;
            if (blacklist.includes(normalizedJ2)) {
                blacklist = blacklist.filter(j => j !== normalizedJ2);
                saveBlacklist();
                await msg.reply(`✅ ${normalizedJ2} karalisteden çıkarıldı.`);
            } else {
                await msg.reply(`❌ ${normalizedJ2} karalistede değil.`);
            }
            return;
        } else if (cmdIs('/kick','/at')) {
            // /kick komutu: Sadece grup sohbetlerinde çalışır
            const chat = await msg.getChat();
            if (!chat.isGroup) {
                await msg.reply('❌ Bu komut sadece grup sohbetlerinde kullanılabilir.');
                return;
            }
            
            // Komut: /kick 905xxxxxxxxx
            const parts = messageText.trim().split(/\s+/);
            if (parts.length < 2) {
                await msg.reply('❌ Lütfen atmak istediğiniz kişinin numarasını yazın. Örnek: /kick 905xxxxxxxxx');
                return;
            }
            let phone = parts[1].replace(/[^0-9]/g, '');
            if (phone.length < 10) {
                await msg.reply('❌ Geçerli bir numara girin. Örnek: /kick 905xxxxxxxxx');
                return;
            }
            if (!phone.startsWith('90')) phone = '90' + phone; // Türkiye için
            const jid = phone + '@c.us';
            
            // Check if sender is group admin or bot admin
            const senderId = msg.author || msg.from;
            const participants = chat.participants;
            const senderParticipant = participants.find(p => p.id._serialized === senderId);
            const isGroupAdmin = senderParticipant && senderParticipant.isAdmin;
            
            if (!isGroupAdmin && !isAdmin(senderId)) {
                await msg.reply('❌ Bu komutu sadece grup yöneticileri veya bot yöneticileri kullanabilir.');
                return;
            }
            
            // Kullanıcıyı gruptan at
            try {
                await chat.removeParticipants([jid]);
                await msg.reply(`✅ ${phone} numaralı kullanıcı gruptan atıldı.`);
            } catch (err) {
                await msg.reply(`❌ Kullanıcı atılamadı. Hata: ${err?.message || err}`);
            }
            return;
        } else if (cmdIs('/lockall')) {
            // /lockall komutu: Sadece grup sohbetlerinde çalışır
            const chat = await msg.getChat();
            if (!chat.isGroup) {
                await msg.reply('❌ Bu komut sadece grup sohbetlerinde kullanılabilir.');
                return;
            }
            
            // Sadece adminler kullanabilsin
            const senderId = msg.author || msg.from;
            const participants = chat.participants;
            const senderParticipant = participants.find(p => p.id._serialized === senderId);
            const isGroupAdmin = senderParticipant && senderParticipant.isAdmin;
            
            // izin: grup yöneticisi veya bot yöneticisi
            if (!isGroupAdmin && !isAdmin(senderId)) {
                await msg.reply('❌ Bu komutu sadece grup yöneticileri veya bot yöneticileri kullanabilir.');
                return;
            }
            
            // Grubu sadece yöneticilere aç
            try {
                await chat.setMessagesAdminsOnly(true);
                await msg.reply('🔒 Grup sadece yöneticilere yazılabilir olarak kilitlendi.');
            } catch (err) {
                await msg.reply(`❌ Grup kilitlenemedi. Hata: ${err?.message || err}`);
            }
            return;
        } else if (cmdIs('/unlock','/kilitac','/kilitaç')) {
            // /unlock komutu: Sadece grup sohbetlerinde çalışır
            const chat = await msg.getChat();
            if (!chat.isGroup) {
                await msg.reply('❌ Bu komut sadece grup sohbetlerinde kullanılabilir.');
                return;
            }
            
            // Sadece adminler kullanabilsin
            const senderId = msg.author || msg.from;
            const participants = chat.participants;
            const senderParticipant = participants.find(p => p.id._serialized === senderId);
            const isGroupAdmin2 = senderParticipant && senderParticipant.isAdmin;
            
            if (!isGroupAdmin2 && !isAdmin(senderId)) {
                await msg.reply('❌ Bu komutu sadece grup yöneticileri veya bot yöneticileri kullanabilir.');
                return;
            }
            
            // Grubu tekrar herkese aç
            try {
                await chat.setMessagesAdminsOnly(false);
                await msg.reply('🔓 Grup tekrar herkese yazılabilir olarak açıldı.');
            } catch (err) {
                await msg.reply(`❌ Grup açılamadı. Hata: ${err?.message || err}`);
            }
            return;
        }
    });

    await client.initialize();
    
    return client;
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
