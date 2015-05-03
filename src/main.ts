/// <reference path="../typescript_defs/node.d.ts" />
/// <reference path="../typescript_defs/colors.d.ts" />
var crypto = require("crypto");
var net = require("net");
var fs = require("fs");
var repl = require("repl");

var colors = require("colors");
var eccrypto = require("eccrypto");
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
function openUserAccount(password: Buffer): string {
	// Open user accounts using provided password
	var rawAccounts: Buffer = fs.readFileSync("accounts.dat", {"flag": "a+"});
	if (rawAccounts.length === 0) {
		// File didn't exist or is empty
		var salt: Buffer = crypto.randomBytes(32); // For PBKDF2
		var iv: Buffer = crypto.randomBytes(12); // For AES
		var key: Buffer = crypto.pbkdf2Sync(password, salt, 500000, 32);
		
		var cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
		var encrypted: Buffer = cipher.update(new Buffer("ff", "hex")); // Buffer with ff to signify no accounts created yet
		encrypted = Buffer.concat([encrypted, cipher.final()]);
		var tag: Buffer = cipher.getAuthTag();
		
		fs.writeFileSync("accounts.dat", Buffer.concat([salt, iv, tag, encrypted], salt.length + iv.length + tag.length + encrypted.length));
		
		return "Created accounts.dat successfully".green;
	}
	else {
		// File exists; decrypt it
		var salt: Buffer = rawAccounts.slice(0, 32);
		var iv: Buffer = rawAccounts.slice(32, 44);
		var tag: Buffer = rawAccounts.slice(44, 60);
		if (salt.length !== 32 || iv.length !== 12 || tag.length !== 16)
			return "Invalid accounts.dat file".red;
		var key: Buffer = crypto.pbkdf2Sync(password, salt, 500000, 32);
		var encrypted = rawAccounts.slice(60, rawAccounts.length);
		
		var cipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
		cipher.setAuthTag(tag);
		var decrypted = cipher.update(encrypted);
		decrypted = Buffer.concat([decrypted, cipher.final()]);
		if (!decrypted)
			return "Wrong password for the accounts.dat file".red;
		if (Buffer.compare(new Buffer("ff", "hex"), decrypted) === 0)
			return "No accounts found. Type 'create <NICKNAME>' to create an account.".yellow;
		return;
	}
}

function commandInput(cmd, context, file, callback): void {
	cmd = /(.*)\r?\n?/.exec(cmd)[1]; // Removes () and \n or \r\n
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