import express from "express";
import { ethers } from "ethers";
import contractInfo from "./artifacts/contracts/DeviceRegistry.sol/DeviceRegistry.json" assert { type: "json" };
import aedesFactory from "aedes";
const aedes = aedesFactory();
import net from "net";

// --- CONFIGURATION ---
const app = express();
app.use(express.json());
const API_PORT = 3000;
const MQTT_PORT = 1884;
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Update if deployed elsewhere

async function main() {
    // 1. Connect to Hardhat blockchain
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

    provider.on("error", (error) => {
        console.error("❌ Blockchain connection error:", error.message);
    });

    try {
        const network = await provider.getNetwork();
        console.log(`✅ Connected to blockchain: ${network.name} (chain ID: ${network.chainId})`);

        const serverWallet = new ethers.Wallet(
            "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // default Hardhat account
            provider
        );

        const contract = new ethers.Contract(CONTRACT_ADDRESS, contractInfo.abi, serverWallet);
        console.log("✅ Edge Server connected to DeviceRegistry contract.");
        console.log(`✅ Registrar address: ${serverWallet.address}`);

        // --- REST APIs ---

        // Device registration
        app.post("/register", async (req, res) => {
            const { deviceID, publicKey } = req.body;
            if (!deviceID || !publicKey) {
                return res.status(400).json({ error: "deviceID and publicKey are required." });
            }

            const deviceIDBytes32 = ethers.encodeBytes32String(deviceID);
            try {
                const tx = await contract.registerDevice(deviceIDBytes32, publicKey);
                await tx.wait();
                console.log(`✅ Registered ${deviceID} on blockchain. Tx: ${tx.hash}`);
                res.status(201).json({ message: "Device registered successfully." });
            } catch (error) {
                if (error.reason && error.reason.includes("Device ID already exists")) {
                    res.status(409).json({ error: "Already registered", details: error.reason });
                } else {
                    console.error("❌ Registration failed:", error.reason || error.message);
                    res.status(500).json({ error: "Registration failed.", details: error.reason || error.message });
                }
            }
        });

        // Get public key
        app.get("/public-key/:deviceID", async (req, res) => {
            const { deviceID } = req.params;
            if (!deviceID) {
                return res.status(400).json({ error: "deviceID is required." });
            }

            try {
                const deviceIDBytes32 = ethers.encodeBytes32String(deviceID);
                const publicKey = await contract.getPublicKey(deviceIDBytes32);
                res.status(200).json({ publicKey });
            } catch (error) {
                console.error("❌ Failed to get public key:", error.reason || error.message);
                res.status(500).json({ error: "Failed to get public key.", details: error.reason || error.message });
            }
        });


        // Start HTTP server
        app.listen(API_PORT, () => {
            console.log(`✅ Edge API Server running at http://localhost:${API_PORT}`);
        });

        // Start MQTT broker
        const mqttServer = net.createServer(aedes.handle);
        mqttServer.listen(MQTT_PORT, () => {
            console.log(`✅ MQTT Broker running at mqtt://localhost:${MQTT_PORT}`);
        });

        // MQTT logs
        aedes.on("client", client => {
            console.log(`[MQTT] Client connected: ${client.id}`);
        });

        aedes.on("clientDisconnect", client => {
            console.log(`[MQTT] Client disconnected: ${client.id}`);
        });

        aedes.on("publish", (packet, client) => {
            if (client) {
                console.log(`[MQTT] ${client.id} published on ${packet.topic}`);
            }
        });

    } catch (error) {
        console.error("❌ Failed to initialize Edge Server:", error.message);
        console.log("💡 Make sure Hardhat node is running.");
        process.exit(1);
    }
}

main();