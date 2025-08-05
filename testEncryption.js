const CryptoJS = require("crypto-js");

// Simulate shared key from your app
const sharedKeyHex = "739bf683a5fc8fc9022e4bffd2daadf67b44ef5b675853fd7266e0b067bd7edd";
const key = CryptoJS.enc.Hex.parse(sharedKeyHex);

// Example message
const message = JSON.stringify({
    timestamp: new Date().toISOString(),
    location: { lat: 1.23, lon: 4.56 },
    altitude: 150,
});

// Encrypt using same logic as publisher.js
const iv = CryptoJS.lib.WordArray.random(16);
const encrypted = CryptoJS.AES.encrypt(message, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
});

const fullMessage = iv.concat(encrypted.ciphertext);
const base64Message = CryptoJS.enc.Base64.stringify(fullMessage);
console.log("🔒 Encrypted (Base64):", base64Message);

// Now decrypt it using subscriber logic
const encryptedWords = CryptoJS.enc.Base64.parse(base64Message);
const ivDec = CryptoJS.lib.WordArray.create(encryptedWords.words.slice(0, 4), 16);
const ct = CryptoJS.lib.WordArray.create(
    encryptedWords.words.slice(4),
    encryptedWords.sigBytes - 16
);

const decrypted = CryptoJS.AES.decrypt({ ciphertext: ct }, key, {
    iv: ivDec,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
});

const result = decrypted.toString(CryptoJS.enc.Utf8);
console.log("✅ Decrypted:", result);
