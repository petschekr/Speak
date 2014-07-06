/// <reference path="../typescript_defs/node.d.ts" />
/// <reference path="../typescript_defs/colors.d.ts" />
var crypto = require("crypto");
var net = require("net");

var colors = require("colors");

import OutboundPeer = require("./outboundpeer");
import InboundPeer = require("./inboundpeer");
import Logging = require("./logging");
var Log: Logging = new Logging();
Log.begin();

// Open connection to LevelDB
var levelup = require("level");
var db = levelup("./speak.db", {
	"createIfMissing": true,
	// Store keys and values as hex
	"keyEncoding": "hex",
	"valueEncoding": "hex"
});

var magicHeader: number = 0xD6EE2BE9;
enum commandBytes {
	"version" = 0x1,
	"versionack" = 0x2,
	"addr" = 0x3
}
var defaultPort: number = 8555;

var inboundPeers: InboundPeer[] = [];
var outboundPeers: OutboundPeer[] = [];

// P2P Server
var server = net.createServer(function(socket) {
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
process.on("SIGINT", function(): void {
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
});