/// <reference path="../typescript_defs/node.d.ts" />
/// <reference path="../typescript_defs/colors.d.ts" />
var crypto = require("crypto");
var net = require("net");

var colors = require("colors");

import Peer = require("./peer");
import InboundPeer = require("./inboundpeer");
import Logging = require("./logging");
var Log: Logging = new Logging();
Log.begin();

var magicHeader: number = 0xD6EE2BE9;
enum commandBytes {
	"version" = 0x1,
	"versionack" = 0x2,
	"addr" = 0x3
}
var defaultPort: number = 8555;

var inboundPeers: InboundPeer[] = [];
var outboundPeers: Peer[] = [];

// P2P Server
var server = net.createServer(function(socket) {
	// New connection
	var inboundPeer: InboundPeer = new InboundPeer(socket);
});
server.listen(defaultPort, function() {
	Log.log("Server listening on port " + defaultPort);

	var peer: Peer = new Peer("127.0.0.1", defaultPort);
	peer.announce();
});