import ntruPackage from 'ntru';
const { ntru } = ntruPackage;
import mqtt from 'mqtt';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

// --- CONFIGURATION ---
const MY_DEVICE_ID = "GCS-Bravo-3";
const PUBLISHER_ID = "UAV-Alpha-7";
const KEY_FILE_PATH = path.join(process.cwd(), 'subscriber-keys.json');

const EDGE_SERVER_URL = "http://localhost:3000";
const MQTT_BROKER = "mqtt://localhost:1884";
const MQTT_TOPIC = `uav/data/${PUBLISHER_ID}`;

// --- Key Management: Load or generate persistent keys ---
async function getKeys() {
    try {
        const keyData = await fs.readFile(KEY_FILE_PATH, 'utf-8');
        const keys = JSON.parse(keyData);
        console.log(`[Subscriber] Loaded keys from ${KEY_FILE_PATH}`);
        return {
            publicKey: keys.publicKey,
            privateKey: new Uint8Array(Buffer.from(keys.privateKey, 'base64')),
        };
    } catch (error) {
        console.log("[Subscriber] No existing keys found. Generating new keys...");
        const keyPair = await ntru.keyPair();
        const keyData = {
            publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
            privateKey: Buffer.from(keyPair.privateKey).toString('base64'),
        };
        await fs.writeFile(KEY_FILE_PATH, JSON.stringify(keyData, null, 2));
        console.log(`[Subscriber] Saved new keys to ${KEY_FILE_PATH}`);
        return { publicKey: keyData.publicKey, privateKey: keyPair.privateKey };
    }
}

// --- XOR Decryption Function (it's the same as encryption) ---
function xorDecrypt(encryptedData, key) {
    const dataBuffer = Buffer.from(encryptedData, 'base64');
    const output = Buffer.alloc(dataBuffer.length);
    for (let i = 0; i < dataBuffer.length; i++) {
        output[i] = dataBuffer[i] ^ key[i % key.length];
    }
    return output;
}

async function main() {
    console.log(`[Subscriber] My ID: ${MY_DEVICE_ID}`);
    const keyPair = await getKeys();
    const myPrivateKey = keyPair.privateKey;

    // Register Public Key
    try {
        console.log("[Subscriber] Registering on the blockchain...");
        await axios.post(`${EDGE_SERVER_URL}/register`, {
            deviceID: MY_DEVICE_ID,
            publicKey: keyPair.publicKey,
        });
        console.log("[Subscriber] Registration successful.");
    } catch (error) {
        if (error.response?.data?.details?.includes("Device ID already exists")) {
            console.warn("[Subscriber] Device already registered. Proceeding...");
        } else {
            console.error("[Subscriber] Registration failed:", error.response ? error.response.data : error.message);
            return;
        }
    }

    const mqttClient = mqtt.connect(MQTT_BROKER);
    mqttClient.on("connect", () => {
        console.log("[Subscriber] Connected to MQTT broker.");
        mqttClient.subscribe(MQTT_TOPIC, (err) => {
            if (err) console.error(`[Subscriber] Subscription error: ${err.message}`);
            else console.log(`[Subscriber] Subscribed to topic: ${MQTT_TOPIC}`);
        });
    });

    mqttClient.on("message", async (topic, message) => {
        console.log(`\n[Subscriber] Received message on ${topic}`);
        const payload = JSON.parse(message.toString());
        const cyphertext = Buffer.from(payload.cyphertext, 'base64');
        const encryptedMessage = payload.encryptedMessage; // This is a Base64 string

        try {
            // Step 1: Use the private key to open the NTRU lockbox and get the secret
            const secret = await ntru.decrypt(cyphertext, myPrivateKey);
            
            // Step 2: Use that secret to decrypt the main data with XOR
            const decryptedBuffer = xorDecrypt(encryptedMessage, secret);
            
            const finalPayload = JSON.parse(decryptedBuffer.toString('utf8'));
            console.log("✅ Decrypted Message:", finalPayload);
            console.log("----------------------------------------");
        } catch (error) {
            console.error("❌ Decryption failed:", error.message);
        }
    });
    mqttClient.on("error", (err) => console.error(`[Subscriber] MQTT Error: ${err.message}`));
}

main();