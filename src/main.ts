/// <reference path="../typescript_defs/node.d.ts" />
/// <reference path="../typescript_defs/colors.d.ts" />
var crypto = require("crypto");
var net = require("net");
var fs = require("fs");
var repl = require("repl");

var colors = require("colors");
var sodium = require("sodium");
var levelup = require("level");

import OutboundPeer = require("./outboundpeer");
import InboundPeer = require("./inboundpeer");
import Logging = require("./logging");
var Log: Logging = new Logging();
Log.begin();

var magicHeader: number = 0xD6EE2BE9;
enum commandBytes {
	"version" = 0x1,
	"versionack" = 0x2,
	"addresses" = 0x3,
	"inventory" = 0x4,
	"getdata" = 0x5
}
var defaultPort: number = 8555;

var inboundPeers: InboundPeer[] = [];
var outboundPeers: OutboundPeer[] = [];

var db;
var server;

function setUp(): void {
	// Open connection to LevelDB
	db = levelup("./speak.db", {
		"createIfMissing": true,
		// Store keys and values as hex
		"keyEncoding": "hex",
		"valueEncoding": "hex"
	});
	// P2P Server
	server = net.createServer(function(socket) {
		// New connection
		var inboundPeer: InboundPeer = new InboundPeer(socket, db);
		inboundPeers.push(inboundPeer);
	});
	server.listen(defaultPort, function() {
		Log.log("Server listening on port " + defaultPort);

		var peer: OutboundPeer = new OutboundPeer("127.0.0.1", defaultPort, db);
		peer.announce();
		outboundPeers.push(peer);
	});
}
function openUserAccount(password: NodeBuffer): string {
	// Open user accounts using provided password
	var rawAccounts: NodeBuffer = fs.readFileSync("accounts.dat", {"flag": "a+"});
	if (rawAccounts.length === 0) {
		// File didn't exist or is empty
		var salt: NodeBuffer = crypto.randomBytes(32); // For PBKDF2
		var nonce: NodeBuffer = crypto.randomBytes(sodium.api.crypto_secretbox_NONCEBYTES); // For decryption
		//var encryptionKeyPair = sodium.api.crypto_box_keypair();
		//var signingKeyPair = sodium.api.crypto_sign_keypair();
		var key: NodeBuffer = crypto.pbkdf2Sync(password, salt, 500000, sodium.api.crypto_secretbox_KEYBYTES);
		var encrypted: NodeBuffer = sodium.api.crypto_secretbox(new Buffer("ff", "hex"), nonce, key); // Buffer with ff to signify no accounts created yet
		fs.writeFileSync("accounts.dat", Buffer.concat([salt, nonce, encrypted], salt.length + nonce.length + encrypted.length));
		// Erase secure data
		sodium.api.memzero(key);
		sodium.api.memzero(encrypted);
		return "Created accounts.dat successfully".green;
	}
	else {
		// File exists; decrypt it
		var salt: NodeBuffer = rawAccounts.slice(0, 32);
		var nonce: NodeBuffer = rawAccounts.slice(32, 32 + sodium.api.crypto_secretbox_NONCEBYTES);
		if (salt.length !== 32 || nonce.length !== sodium.api.crypto_secretbox_NONCEBYTES)
			return "Invalid accounts.dat file".red;
		var key: NodeBuffer = crypto.pbkdf2Sync(password, salt, 500000, sodium.api.crypto_secretbox_KEYBYTES);
		var encrypted = rawAccounts.slice(32 + sodium.api.crypto_secretbox_NONCEBYTES, rawAccounts.length);
		var decrypted = sodium.api.crypto_secretbox_open(encrypted, nonce, key);
		if (!decrypted)
			return "Wrong password for the accounts.dat file".red;
		if (sodium.api.memcmp(decrypted, new Buffer("ff", "hex"), 1) === 0)
			return "No accounts found. Type 'create <NICKNAME>' to create an account.".yellow;
		return;
	}
}

function commandInput(cmd, context, file, callback): void {
	cmd = /\((.*)\r?\n?\)/.exec(cmd)[1]; // Removes () and \n or \r\n
	var unlockCmd: RegExp = /^unlock (.*)/i;
	var quitCmd: RegExp = /^(exit|quit)/i;
	if (cmd.match(unlockCmd)) {
		var password = new Buffer(unlockCmd.exec(cmd)[1]);
		console.log("Unlocking wallet...".blue);
		var message: string = openUserAccount(password);
		if (!message)
			callback("Opened successfully".green);
		else
			callback(message);
	}
	else if (cmd.match(quitCmd)) {
		quit();
	}
	else {
		callback("Unknown command".red);
	}
}

setUp();
// Begin the REPL
repl.start({
	"prompt": "Speak > ",
	"eval": commandInput
}).on("exit", quit);

// Purge dead connections every 10 seconds
setInterval(function(): void {
	var i: number;
	for (i = inboundPeers.length - 1; i >= 0; i--) {
		if (!inboundPeers[i].stillAlive)
			inboundPeers.splice(i, 1);
	}
	for (i = outboundPeers.length - 1; i >= 0; i--) {
		if (!outboundPeers[i].stillAlive)
			outboundPeers.splice(i, 1);
	}
}, 1000 * 10);

// Ctrl-C handler
process.on("SIGINT", quit);
function quit(): void {
	Log.log("Received SIGINT, shutting down...");

	for (var i: number = 0; i < inboundPeers.length; i++) {
		inboundPeers[i].kill();
	}
	for (var i: number = 0; i < outboundPeers.length; i++) {
		outboundPeers[i].kill();
	}
	// Close the LevelDB instance
	db.close(function(): void {
		Log.log("Done shutting down");
		process.exit(0);
	});
}