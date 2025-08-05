import hre from "hardhat";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  const deviceRegistry = await hre.ethers.deployContract("DeviceRegistry");

  await deviceRegistry.waitForDeployment();

  console.log(`DeviceRegistry contract deployed to: ${deviceRegistry.target}`);

  // Grant registrar status to the deployer account so it can act as the Edge Server
  console.log("Granting registrar role to deployer account...");
  const tx = await deviceRegistry.addRegistrar(deployer.address);
  await tx.wait();
  console.log(`Registrar role granted to ${deployer.address}. Ready to register devices.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});