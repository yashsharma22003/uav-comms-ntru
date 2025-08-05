import ntru from 'ntru';

const keyPair /*: {privateKey: Uint8Array; publicKey: Uint8Array} */ =
	await ntru.keyPair()
;

const {cyphertext, secret} /*: {cyphertext: Uint8Array; secret: Uint8Array} */ =
	await ntru.encrypt(keyPair.publicKey)
;

const decrypted /*: Uint8Array */ =
	await ntru.decrypt(cyphertext, keyPair.privateKey) // same as secret
;

console.log(keyPair);
console.log(secret);
console.log(cyphertext);
console.log(decrypted);