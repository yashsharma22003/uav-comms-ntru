import ntruPackage from 'ntru';
const { ntru } = ntruPackage;
import mqtt from 'mqtt';
import axios from 'axios';
import { ethers } from 'ethers';
import fs from 'fs/promises';
import path from 'path';
import contractInfo from './artifacts/contracts/DeviceRegistry.sol/DeviceRegistry.json' assert { type: 'json' };

// --- CONFIGURATION ---
const MY_DEVICE_ID = "UAV-Alpha-7";
const SUBSCRIBER_ID = "GCS-Bravo-3";
const KEY_FILE_PATH = path.join(process.cwd(), 'publisher-keys.json');

const EDGE_SERVER_URL = "http://localhost:3000";
const MQTT_BROKER = "mqtt://localhost:1884";
const MQTT_TOPIC = `uav/data/${MY_DEVICE_ID}`;

// --- BLOCKCHAIN CONFIGURATION ---
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const BLOCKCHAIN_NODE_URL = "http://127.0.0.1:8545";
const CONTRACT_ABI = contractInfo.abi;

// --- Key Management: Load or generate persistent keys ---
async function getKeys() {
    try {
        const keyData = await fs.readFile(KEY_FILE_PATH, 'utf-8');
        const keys = JSON.parse(keyData);
        console.log(`[Publisher] Loaded keys from ${KEY_FILE_PATH}`);
        return {
            publicKey: Buffer.from(keys.publicKey, 'base64'),
            privateKey: Buffer.from(keys.privateKey, 'base64'),
        };
    } catch (error) {
        console.log("[Publisher] No existing keys found. Generating new keys...");
        const keyPair = await ntru.keyPair();
        const keyData = {
            publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
            privateKey: Buffer.from(keyPair.privateKey).toString('base64'),
        };
        await fs.writeFile(KEY_FILE_PATH, JSON.stringify(keyData, null, 2));
        console.log(`[Publisher] Saved new keys to ${KEY_FILE_PATH}`);
        return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
    }
}

// --- XOR Encryption Function ---
function xorEncrypt(data, key) {
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const output = Buffer.alloc(dataBuffer.length);
    for (let i = 0; i < dataBuffer.length; i++) {
        output[i] = dataBuffer[i] ^ key[i % key.length];
    }
    return output;
}

async function main() {
    console.log(`[Publisher] My ID: ${MY_DEVICE_ID}`);
    const keyPair = await getKeys();
    const myPublicKeyForRegistration = Buffer.from(keyPair.publicKey).toString('base64');

    // Register Public Key
    try {
        console.log("[Publisher] Registering on the blockchain...");
        await axios.post(`${EDGE_SERVER_URL}/register`, {
            deviceID: MY_DEVICE_ID,
            publicKey: myPublicKeyForRegistration,
        });
        console.log("[Publisher] Registration successful.");
    } catch (error) {
        if (error.response?.data?.details?.includes("Device ID already exists")) {
            console.warn("[Publisher] Device already registered. Proceeding...");
        } else {
            console.error("[Publisher] Registration failed:", error.response ? error.response.data : error.message);
            return;
        }
    }

    // Get subscriber's public key from the blockchain
    let subscriberPublicKey;
    try {
        console.log(`[Publisher] Requesting subscriber's public key for ${SUBSCRIBER_ID} from blockchain...`);
        const provider = new ethers.JsonRpcProvider(BLOCKCHAIN_NODE_URL);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        const deviceIDBytes32 = ethers.encodeBytes32String(SUBSCRIBER_ID);
        const publicKeyString = await contract.getPublicKey(deviceIDBytes32);

        if (!publicKeyString || publicKeyString.length === 0) throw new Error("Public key not found on blockchain.");

        subscriberPublicKey = Buffer.from(publicKeyString, 'base64');
        console.log("[Publisher] Subscriber's public key received.");
    } catch (error) {
        console.error("[Publisher] Failed to get public key:", error.message);
        return;
    }

    const mqttClient = mqtt.connect(MQTT_BROKER);
    mqttClient.on("connect", () => {
        console.log("[Publisher] Connected to MQTT broker.");
        setInterval(async () => {
            const message = {
                timestamp: new Date().toISOString(),
                location: { lat: 34.0522, lon: -118.2437 },
            };
            const messageString = JSON.stringify(message);
            try {
                // Step 1: Use NTRU to create a secret and a lockbox (cyphertext)
                const { cyphertext, secret } = await ntru.encrypt(subscriberPublicKey);

                // --- ADDED FOR RESEARCH ---
                // console.log(`    [Debug] NTRU Secret (Base64): ${Buffer.from(secret).toString('base64')}`);
                // console.log(`    [Debug] NTRU Cyphertext (Base64): ${Buffer.from(cyphertext).toString('base64')}`);
                // -------------------------

                // Step 2: Use the NTRU secret to encrypt the message with XOR
                const xorEncryptedMessage = xorEncrypt(messageString, secret);

                // Step 3: Send the NTRU lockbox and the XOR-encrypted data
                const payload = JSON.stringify({
                    cyphertext: Buffer.from(cyphertext).toString('base64'),
                    encryptedMessage: xorEncryptedMessage.toString('base64'),
                });
                mqttClient.publish(MQTT_TOPIC, payload);
                console.log(`[Publisher] Sent NTRU-based encrypted message.`);
            } catch (error) {
                console.error("[Publisher] Encryption error:", error.message);
            }
        }, 5000);
    });
    mqttClient.on("error", (err) => console.error(`[Publisher] MQTT Error: ${err.message}`));
}

main();