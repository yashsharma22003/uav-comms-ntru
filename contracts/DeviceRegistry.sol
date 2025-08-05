// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DeviceRegistry
 * @dev A smart contract to register device IDs and their public keys on the blockchain.
 * Access to registration is controlled by an owner who can grant registrar roles
 * to trusted Edge Servers.
 */
contract DeviceRegistry is Ownable {
    // Mapping from an address to its registrar status
    mapping(address => bool) public registrars;

    // Mapping from a device ID to its public key
    mapping(bytes32 => string) public devicePublicKeys;

    // Event to log new device registrations
    event DeviceRegistered(bytes32 indexed deviceID, address indexed registeredBy);

    constructor() Ownable(msg.sender) {
        // The contract deployer is the initial owner
        // No registrars are set initially
    }   

    /**
     * @dev Throws if called by any account that is not a registrar.
     */
    modifier onlyRegistrar() {
        require(registrars[msg.sender], "Caller is not an authorized registrar");
        _;
    }

    /**
     * @dev The owner can grant registrar status to a new address (Edge Server).
     * @param _serverAddress The wallet address of the Edge Server.
     */
    function addRegistrar(address _serverAddress) public onlyOwner {
        registrars[_serverAddress] = true;
    }

    /**
     * @dev The owner can revoke registrar status.
     * @param _serverAddress The wallet address of the Edge Server.
     */
    function removeRegistrar(address _serverAddress) public onlyOwner {
        registrars[_serverAddress] = false;
    }

    /**
     * @dev Registers a new device. Can only be called by an authorized registrar.
     * Stores a string representation of the public key.
     * @param deviceID The unique identifier for the device (e.g., a pseudonymous hash).
     * @param publicKey The public key of the device.
     */
    function registerDevice(bytes32 deviceID, string calldata publicKey) public onlyRegistrar {
        require(bytes(devicePublicKeys[deviceID]).length == 0, "Device ID already exists");
        devicePublicKeys[deviceID] = publicKey;
        emit DeviceRegistered(deviceID, msg.sender);
    }

    /**
     * @dev Publicly retrieves the public key for a given device ID.
     * This is a view function and does not cost any gas to call.
     * @param deviceID The ID of the device to query.
     * @return The public key as a string.
     */
    function getPublicKey(bytes32 deviceID) public view returns (string memory) {
        require(bytes(devicePublicKeys[deviceID]).length > 0, "Device not found");
        return devicePublicKeys[deviceID];
    }

}