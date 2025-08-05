import express from "express";
import { ethers } from "ethers";
import contractInfo from "./artifacts/contracts/DeviceRegistry.sol/DeviceRegistry.json" assert { type: "json" };
import aedesFactory from "aedes";
const aedes = aedesFactory();
import net from "net";
import fs from 'fs';
import path from 'path';

// --- CONFIGURATION ---
const app = express();
app.use(express.json());
const API_PORT = 3000;
const MQTT_PORT = 1884;
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const METRICS_FILE_PATH = path.join(process.cwd(), 'edge_server_metrics.csv');

// --- METRICS SETUP ---
const metricsStream = fs.createWriteStream(METRICS_FILE_PATH, { flags: 'a' });
metricsStream.write('timestamp_iso,metric_name,value_gas,tx_hash\n');
// --- END METRICS SETUP ---

async function main() {
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    provider.on("error", (error) => console.error("❌ Blockchain connection error:", error.message));

    try {
        const network = await provider.getNetwork();
        console.log(`✅ Connected to blockchain: ${network.name} (chain ID: ${network.chainId})`);

        const serverWallet = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, contractInfo.abi, serverWallet);
        console.log("✅ Edge Server connected to DeviceRegistry contract.");

        // --- API: Device Registration ---
        app.post("/register", async (req, res) => {
            const { deviceID, publicKey } = req.body;
            if (!deviceID || !publicKey) {
                return res.status(400).json({ error: "deviceID and publicKey are required." });
            }

            const deviceIDBytes32 = ethers.encodeBytes32String(deviceID);
            try {
                const tx = await contract.registerDevice(deviceIDBytes32, publicKey);
                const receipt = await tx.wait();

                // --- THIS IS WHERE THE SERVER LOGS EACH TRANSACTION ---
                const timestamp = new Date().toISOString();
                const gasUsed = receipt.gasUsed.toString();
                metricsStream.write(`${timestamp},registration_gas,${gasUsed},${receipt.hash}\n`);
                // ----------------------------------------------------

                console.log(`✅ Registered ${deviceID} on blockchain. Gas: ${gasUsed}`);
                res.status(201).json({ message: "Device registered successfully." });
            } catch (error) {
                if (error.reason?.includes("Device ID already exists")) {
                    res.status(409).json({ error: "Already registered", details: error.reason });
                } else {
                    console.error("❌ Registration failed:", error.reason || error.message);
                    res.status(500).json({ error: "Registration failed.", details: error.reason || error.message });
                }
            }
        });

        app.listen(API_PORT, () => console.log(`✅ Edge API Server running at http://localhost:${API_PORT}`));
        const mqttServer = net.createServer(aedes.handle);
        mqttServer.listen(MQTT_PORT, () => console.log(`✅ MQTT Broker running at mqtt://localhost:${MQTT_PORT}`));

    } catch (error) {
        console.error("❌ Failed to initialize Edge Server:", error.message);
        process.exit(1);
    }
}

main();