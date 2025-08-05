import ntruPackage from 'ntru';
const { ntru } = ntruPackage;

async function runDemo() {
    console.log("### Starting NTRU Core Demonstration ###");

    // --- 1. Both sides generate their key pairs ---
    // In a real system, these would be generated once and stored securely.
    const publisherKeyPair = await ntru.keyPair();
    const subscriberKeyPair = await ntru.keyPair();
    console.log("\n[Step 1] Publisher and Subscriber have generated their unique key pairs.");


    // --- 2. Publisher encrypts a secret for the Subscriber ---
    // The publisher only needs the subscriber's PUBLIC key to do this.
    console.log("\n[Step 2] Publisher is creating a secret for the Subscriber...");

    const { cyphertext, secret: publisherSecret } = await ntru.encrypt(subscriberKeyPair.publicKey);

    console.log("   -> Publisher's side generated a secret.");
    console.log("   -> Publisher's side created a 'cyphertext' (a locked box for the secret).");


    // --- 3. Log the values on the Publisher's side for research ---
    console.log("\n[Step 3] Publisher's generated values:");
    console.log(`   -> Secret (Base64):      ${Buffer.from(publisherSecret).toString('base64')}`);
    console.log(`   -> Cyphertext (Base64):  ${Buffer.from(cyphertext).toString('base64')}`);


    // --- 4. Subscriber decrypts the cyphertext ---
    // The subscriber uses the cyphertext from the publisher and its OWN PRIVATE key.
    console.log("\n[Step 4] Subscriber receives the cyphertext and decrypts it...");

    const subscriberSecret = await ntru.decrypt(cyphertext, subscriberKeyPair.privateKey);

    console.log("   -> Subscriber's side recovered the secret.");
    console.log(`   -> Recovered Secret (Base64): ${Buffer.from(subscriberSecret).toString('base64')}`);


    // --- 5. Verification ---
    // We compare the secret the publisher generated with the secret the subscriber recovered.
    console.log("\n[Step 5] Verifying if the secrets match...");

    // Buffer.equals() is the correct way to compare raw byte data.
    const secretsMatch = Buffer.from(publisherSecret).equals(Buffer.from(subscriberSecret));

    if (secretsMatch) {
        console.log("\n✅ Success: The secrets match perfectly!");
    } else {
        console.log("\n❌ Failure: The secrets DO NOT match.");
    }
}

runDemo();