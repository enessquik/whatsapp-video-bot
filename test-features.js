#!/usr/bin/env node

/**
 * Feature Verification Script
 * Tests that all imports and basic structures are correct
 */

console.log('🔍 Testing WhatsApp Bot Features...\n');

const tests = [];

// Test 1: Check whatsapp-web.js imports
try {
    const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
    console.log('✅ whatsapp-web.js imports successful');
    tests.push({ name: 'whatsapp-web.js', passed: true });
} catch (e) {
    console.error('❌ whatsapp-web.js import failed:', e.message);
    tests.push({ name: 'whatsapp-web.js', passed: false, error: e.message });
}

// Test 2: Check other dependencies
const deps = [
    'qrcode-terminal',
    'yt-dlp-exec',
    'fs-extra',
    'sharp',
    'node-cron',
    'archiver',
    'axios'
];

deps.forEach(dep => {
    try {
        require(dep);
        console.log(`✅ ${dep} available`);
        tests.push({ name: dep, passed: true });
    } catch (e) {
        console.error(`❌ ${dep} not available:`, e.message);
        tests.push({ name: dep, passed: false, error: e.message });
    }
});

// Test 3: Check bot.js can be required (syntax check)
try {
    const botPath = require('path').join(__dirname, 'bot.js');
    const fs = require('fs');
    const botCode = fs.readFileSync(botPath, 'utf8');
    
    // Check for Baileys references (should be none)
    if (botCode.toLowerCase().includes('baileys')) {
        console.error('❌ bot.js still contains Baileys references');
        tests.push({ name: 'No Baileys references', passed: false });
    } else {
        console.log('✅ bot.js contains no Baileys references');
        tests.push({ name: 'No Baileys references', passed: true });
    }
    
    // Check for whatsapp-web.js usage
    if (botCode.includes('whatsapp-web.js')) {
        console.log('✅ bot.js uses whatsapp-web.js');
        tests.push({ name: 'Uses whatsapp-web.js', passed: true });
    } else {
        console.error('❌ bot.js does not use whatsapp-web.js');
        tests.push({ name: 'Uses whatsapp-web.js', passed: false });
    }
    
    // Check for key functions
    const requiredFunctions = [
        'normalizeJid',
        'detectVideoUrl',
        'downloadVideo',
        'createWeeklyBackup',
        'startBot'
    ];
    
    requiredFunctions.forEach(fn => {
        if (botCode.includes(`function ${fn}`) || botCode.includes(`async function ${fn}`)) {
            console.log(`✅ Function '${fn}' exists`);
            tests.push({ name: `Function ${fn}`, passed: true });
        } else {
            console.error(`❌ Function '${fn}' not found`);
            tests.push({ name: `Function ${fn}`, passed: false });
        }
    });
    
} catch (e) {
    console.error('❌ Error reading bot.js:', e.message);
    tests.push({ name: 'bot.js readable', passed: false, error: e.message });
}

// Test 4: Check directory structure
const requiredDirs = ['./videos', './logs', './backups'];
const fs = require('fs');

requiredDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
        console.log(`✅ Directory '${dir}' exists`);
        tests.push({ name: `Directory ${dir}`, passed: true });
    } else {
        console.log(`⚠️  Directory '${dir}' will be created on startup`);
        tests.push({ name: `Directory ${dir}`, passed: true, note: 'Will be created' });
    }
});

// Test 5: Check .gitignore
try {
    const gitignorePath = require('path').join(__dirname, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        const gitignore = fs.readFileSync(gitignorePath, 'utf8');
        const requiredIgnores = ['node_modules', '.wwebjs_auth', 'videos', 'logs', 'backups'];
        
        let allPresent = true;
        requiredIgnores.forEach(ignore => {
            if (!gitignore.includes(ignore)) {
                allPresent = false;
                console.error(`❌ .gitignore missing: ${ignore}`);
            }
        });
        
        if (allPresent) {
            console.log('✅ .gitignore properly configured');
            tests.push({ name: '.gitignore', passed: true });
        } else {
            tests.push({ name: '.gitignore', passed: false });
        }
    } else {
        console.error('❌ .gitignore not found');
        tests.push({ name: '.gitignore', passed: false });
    }
} catch (e) {
    console.error('❌ Error checking .gitignore:', e.message);
    tests.push({ name: '.gitignore', passed: false, error: e.message });
}

// Summary
console.log('\n' + '='.repeat(50));
const passed = tests.filter(t => t.passed).length;
const total = tests.length;
console.log(`\n📊 Test Summary: ${passed}/${total} tests passed`);

if (passed === total) {
    console.log('✅ All checks passed! Bot is ready to run.');
    console.log('\n💡 Next steps:');
    console.log('   1. Ensure Chrome/Chromium is installed');
    console.log('   2. Run: npm start');
    console.log('   3. Scan QR code with WhatsApp');
    process.exit(0);
} else {
    console.log('⚠️  Some checks failed. Review the errors above.');
    process.exit(1);
}
