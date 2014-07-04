/// <reference path="../typescript_defs/node.d.ts" />
/// <reference path="../typescript_defs/colors.d.ts" />
import crypto = require("crypto");
import net = require("net");
var bignum = require("bignum");

var colors = require("colors");

var magicHeader: number = 0xD6EE2BE9;
enum commandBytes {
	"version" = 0x1,
	"versionack" = 0x2,
	"addr" = 0x3
}
var defaultPort: number = 8555;

class InboundPeer {
	private socket: any;

	constructor(socket: any) {
		this.socket = socket;
		// New connection
		console.log("Peer with IP ".blue + this.socket.remoteAddress + " connected".blue);
		// Set up event handlers
		this.socket.on("data", this.processData.bind(this));
		this.socket.on("end", this.kill.bind(this, true));
	}
	private processData(receivedBuffer: NodeBuffer): void {
		console.log("Received: ", receivedBuffer);
		if (receivedBuffer.length < 13 || receivedBuffer.readUInt32BE(0) !== magicHeader) {
			console.log("Peer with IP ".yellow + this.socket.remoteAddress + " sent invalid header".yellow);
			return;
		}
		var command = receivedBuffer.readUInt8(4);
		// Check for validity of command
		if (!commandBytes[command]) {
			console.log("Peer with IP ".yellow + this.socket.remoteAddress + " sent invalid command ".yellow + "(" + command.toString(16) + ")");
			return;
		}
		// Check for integrity of payload
		var payloadLength = receivedBuffer.readUInt32BE(5);
		var payload = receivedBuffer.slice(13, 13 + payloadLength); // Node checks for reading past the last value in the buffer
		var checksum = receivedBuffer.slice(9, 13);
		if (crypto.createHash("sha256").update(payload).digest().slice(0, 4).toString() !== checksum.toString()) { // Can't compare buffers directly so compare the .toString()
			console.log("Peer with IP ".yellow + this.socket.remoteAddress + " sent corrupted or missing data".yellow);
			return;
		}
		console.log("Peer with IP ".green + this.socket.remoteAddress + " sent data successfully".green);
		this.processPayload(command, payload);
	}
	private processPayload(command: number, payload: NodeBuffer): void {

	}
	public kill(automatic: boolean = false): void {
		if (automatic) {
			console.log("Inbound peer with IP " + this.socket.remoteAddress + " disconnected");
		}
		else {
			console.log("Disconnected from inbound peer with IP " + this.socket.remoteAddress + " successfully");
		}
		this.socket.end();
	}
}

export = InboundPeer;