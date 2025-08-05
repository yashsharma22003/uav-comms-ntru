import { ethers } from 'ethers';
import contractInfo from './artifacts/contracts/DeviceRegistry.sol/DeviceRegistry.json' assert { type: 'json' };

// --- TEST CONFIGURATION ---
const TOTAL_TRANSACTIONS = 100; // Number of transactions to send
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const BLOCKCHAIN_NODE_URL = "http://127.0.0.1:8545";
const REGISTRAR_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // The default Hardhat account key with registrar role
const CONTRACT_ABI = contractInfo.abi;

async function runStressTest() {
    console.log("### Starting Blockchain Sequential Transaction Test ###");
    console.log(`Sending ${TOTAL_TRANSACTIONS} transactions one by one...`);

    const provider = new ethers.JsonRpcProvider(BLOCKCHAIN_NODE_URL);
    const registrarWallet = new ethers.Wallet(REGISTRAR_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, registrarWallet);

    const latencies = [];
    const overallStartTime = performance.now();

    try {
        // Use a sequential loop, waiting for each transaction to complete
        for (let i = 0; i < TOTAL_TRANSACTIONS; i++) {
            const deviceID = `tps-test-${i}-${Date.now()}`;
            const deviceIDBytes32 = ethers.encodeBytes32String(deviceID);
            const dummyPublicKey = "0x01";

            const txStartTime = performance.now();
            
            // Send the transaction and wait for it to be mined before continuing the loop
            const tx = await contract.registerDevice(deviceIDBytes32, dummyPublicKey);
            await tx.wait(); 
            
            const txEndTime = performance.now();

            const latency = txEndTime - txStartTime;
            latencies.push(latency);
            console.log(`Transaction ${i + 1}/${TOTAL_TRANSACTIONS} confirmed. Latency: ${latency.toFixed(2)} ms`);
        }

        const overallEndTime = performance.now();
        const totalTimeSeconds = (overallEndTime - overallStartTime) / 1000;

        // Calculate statistics
        const averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        const estimatedTps = 1000 / averageLatency; // TPS based on the average time for one transaction

        console.log("\n--- Sequential Test Complete ---");
        console.log(`Total Transactions Confirmed: ${TOTAL_TRANSACTIONS}`);
        console.log(`Total Time Taken: ${totalTimeSeconds.toFixed(2)} seconds`);
        console.log(`Average Latency per Transaction: ${averageLatency.toFixed(2)} ms`);
        console.log(`Estimated Sequential TPS: ${estimatedTps.toFixed(2)} transactions per second`);

    } catch (error) {
        console.error("\n❌ An error occurred during the test:", error);
    }
}

runStressTest();