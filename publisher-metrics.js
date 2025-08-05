// publisher.mjs - Definitive Version

import ntruPackage from 'ntru';
const { ntru } = ntruPackage;
import mqtt from 'mqtt';
import axios from 'axios';
import { ethers } from 'ethers';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import contractInfo from './artifacts/contracts/DeviceRegistry.sol/DeviceRegistry.json' assert { type: 'json' };

// --- CONFIGURATION ---
const MY_DEVICE_ID = "UAV-Alpha-7";
const SUBSCRIBER_ID = "GCS-Bravo-3";
const KEY_FILE_PATH = path.join(process.cwd(), 'publisher-keys.json');
const METRICS_FILE_PATH = path.join(process.cwd(), 'publisher_metrics.csv');
const EDGE_SERVER_URL = "http://localhost:3000";
const MQTT_BROKER = "mqtt://localhost:1884";
const MQTT_TOPIC = `uav/data/${MY_DEVICE_ID}`;
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const BLOCKCHAIN_NODE_URL = "http://127.0.0.1:8545";
const CONTRACT_ABI = contractInfo.abi;

const metricsStream = fs.createWriteStream(METRICS_FILE_PATH, { flags: 'a' });
metricsStream.write('timestamp_iso,metric_name,value_ms\n');

async function getKeys() {
    try {
        const keyData = await fsp.readFile(KEY_FILE_PATH, 'utf-8');
        const keys = JSON.parse(keyData);
        // ADDED THIS LOG FOR BETTER DEBUGGING
        console.log(`[Publisher] Loaded keys from ${KEY_FILE_PATH}`);
        return keys;
    } catch (error) {
        console.log("[Publisher] No existing keys found. Generating new keys...");
        const startTime = performance.now();
        const keyPair = await ntru.keyPair();
        const endTime = performance.now();
        metricsStream.write(`${new Date().toISOString()},key_generation,${endTime - startTime}\n`);
        const keyData = {
            publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
            privateKey: Buffer.from(keyPair.privateKey).toString('base64'),
        };
        await fsp.writeFile(KEY_FILE_PATH, JSON.stringify(keyData, null, 2));
        return keyData;
    }
}

async function main() {
    console.log(`[Publisher] My ID: ${MY_DEVICE_ID}`);
    const keys = await getKeys();
    const myPublicKeyForRegistration = keys.publicKey;
    
    try {
        await axios.post(`${EDGE_SERVER_URL}/register`, { deviceID: MY_DEVICE_ID, publicKey: myPublicKeyForRegistration });
        console.log("[Publisher] Registration successful or already done.");
    } catch (error) { /* condensed */ }

    let subscriberPublicKey;
    try {
        console.log(`[Publisher] Requesting subscriber's public key...`);
        const provider = new ethers.JsonRpcProvider(BLOCKCHAIN_NODE_URL);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        const deviceIDBytes32 = ethers.encodeBytes32String(SUBSCRIBER_ID);
        
        const startTime = performance.now();
        const publicKeyString = await contract.getPublicKey(deviceIDBytes32);
        const endTime = performance.now();
        metricsStream.write(`${new Date().toISOString()},blockchain_read_latency,${endTime - startTime}\n`);
        
        if (!publicKeyString) throw new Error("Public key not found.");
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
            try {
                const startTime = performance.now();
                const { cyphertext, secret } = await ntru.encrypt(subscriberPublicKey);
                const endTime = performance.now();
                metricsStream.write(`${new Date().toISOString()},ntru_encapsulation,${endTime - startTime}\n`);
                
                const payload = JSON.stringify({
                    sentAt: performance.now(),
                    cyphertext: Buffer.from(cyphertext).toString('base64'),
                });
                mqttClient.publish(MQTT_TOPIC, payload);
                // This log should now appear
                console.log(`[Publisher] Sent message at ${new Date().toLocaleTimeString()}`);
            } catch (error) {
                console.error("[Publisher] Encryption error:", error.message);
            }
        }, 5000);
    });
    mqttClient.on("error", (err) => console.error(`[Publisher] MQTT Error: ${err.message}`));
}

main();