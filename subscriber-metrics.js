import ntruPackage from 'ntru';
const { ntru } = ntruPackage;
import mqtt from 'mqtt';
import axios from 'axios';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

// --- CONFIGURATION ---
const MY_DEVICE_ID = "GCS-Bravo-3";
const PUBLISHER_ID = "UAV-Alpha-7";
const KEY_FILE_PATH = path.join(process.cwd(), 'subscriber-keys.json');
const METRICS_FILE_PATH = path.join(process.cwd(), 'subscriber_metrics.csv');
const EDGE_SERVER_URL = "http://localhost:3000";
const MQTT_BROKER = "mqtt://localhost:1884";
const MQTT_TOPIC = `uav/data/${PUBLISHER_ID}`;

// --- METRICS SETUP ---
const metricsStream = fs.createWriteStream(METRICS_FILE_PATH, { flags: 'a' });
metricsStream.write('timestamp_iso,metric_name,value_ms\n');
// --- END METRICS SETUP ---

async function getKeys() {
    try {
        const keyData = await fsp.readFile(KEY_FILE_PATH, 'utf-8');
        return {
            publicKey: JSON.parse(keyData).publicKey,
            privateKey: new Uint8Array(Buffer.from(JSON.parse(keyData).privateKey, 'base64')),
        };
    } catch (error) {
        const startTime = performance.now();
        const keyPair = await ntru.keyPair();
        const endTime = performance.now();
        // --- METRICS ---
        metricsStream.write(`${new Date().toISOString()},key_generation,${endTime - startTime}\n`);
        // --- END METRICS ---
        const keyData = {
            publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
            privateKey: Buffer.from(keyPair.privateKey).toString('base64'),
        };
        await fsp.writeFile(KEY_FILE_PATH, JSON.stringify(keyData, null, 2));
        return { publicKey: keyData.publicKey, privateKey: keyPair.privateKey };
    }
}

async function main() {
    console.log(`[Subscriber] My ID: ${MY_DEVICE_ID}`);
    const keyPair = await getKeys();
    const myPrivateKey = keyPair.privateKey;

    try {
        await axios.post(`${EDGE_SERVER_URL}/register`, { deviceID: MY_DEVICE_ID, publicKey: keyPair.publicKey });
        console.log("[Subscriber] Registration successful or already done.");
    } catch (error) { /* condensed error handling */ }

    const mqttClient = mqtt.connect(MQTT_BROKER);
    mqttClient.on("connect", () => {
        console.log("[Subscriber] Connected to MQTT broker.");
        mqttClient.subscribe(MQTT_TOPIC, (err) => {
            if (!err) console.log(`[Subscriber] Subscribed to topic: ${MQTT_TOPIC}`);
        });
    });

    mqttClient.on("message", async (topic, message) => {
        const receivedAt = performance.now();
        const payload = JSON.parse(message.toString());
        const cyphertext = Buffer.from(payload.cyphertext, 'base64');

        try {
            const startTime = performance.now();
            const secret = await ntru.decrypt(cyphertext, myPrivateKey);
            const endTime = performance.now();

            // --- METRICS ---
            const totalLatency = receivedAt - payload.sentAt;
            const timestamp = new Date().toISOString();
            metricsStream.write(`${timestamp},ntru_decapsulation,${endTime - startTime}\n`);
            metricsStream.write(`${timestamp},end_to_end_latency,${totalLatency}\n`);
            // --- END METRICS ---

            console.log(`✅ Decryption successful. Latency: ${totalLatency.toFixed(2)} ms`);
        } catch (error) {
            console.error("❌ Decryption failed:", error.message);
        }
    });
    mqttClient.on("error", (err) => console.error(`[Subscriber] MQTT Error: ${err.message}`));
}

main();