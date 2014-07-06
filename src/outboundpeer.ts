/// <reference path="../typescript_defs/node.d.ts" />
/// <reference path="../typescript_defs/colors.d.ts" />
import crypto = require("crypto");
import net = require("net");
var bignum = require("bignum");

import Logging = require("./logging");
var Log: Logging = new Logging();

var magicHeader: number = 0xD6EE2BE9;
enum commandBytes {
	"version" = 0x1,
	"versionack" = 0x2,
	"addr" = 0x3
}
var defaultPort: number = 8555;

interface version {
	major: number; // incompatible API changes
	minor: number; // added functionality in a backwards-compatible manner
	patch: number; // backwards-compatible bug fixes
	revision: number;
}

class OutboundPeer {
	public ip: string;
	public port: number;

	private socket: any; // net.Socket
	private db: any;

	public stillAlive: boolean = true;
	private version: version = {
		"major": 0,
		"minor": 0,
		"patch": 1,
		"revision": 0
	};
	public connectionNonce: string = undefined;

	private initialTimeout: number = 1000 * 20; // 20 seconds
	private normalTimeout: number = 1000 * 60 * 10; // 10 minutes

	constructor(ip: string, port: number, db: any) {
		this.ip = ip;
		this.port = port;
		this.db = db;

		this.connect();
	}
	public connect(): void {
		Log.log("Connecting to peer with IP " + this.ip);
		this.socket = net.connect(this.port, this.ip);
		// Set up event handlers
		this.socket.on("data", this.processData.bind(this));
		this.socket.on("end", this.kill.bind(this, true));
		// Set up timeout for version command
		this.socket.setTimeout(this.initialTimeout, (function(): void {
			// This timout is at first 20 seconds. After receiving a valid version message, the timeout is set to 10 minutes
			Log.error("Connection to outbound peer with IP " + this.socket.remoteAddress + " timed out");
			this.kill();
		}).bind(this));
	}
	private generateHeader(command: number, payload: NodeBuffer): NodeBuffer {
		var messageHeader = new Buffer(13);
		messageHeader.writeUInt32BE(magicHeader, 0); // Magic number header
		messageHeader.writeUInt8(command, 4); // Command byte
		messageHeader.writeUInt32BE(payload.length, 5); // Payload length (0 for version command)
		crypto.createHash("sha256").update(payload).digest().slice(0, 4).copy(messageHeader, 9); // Hash of payload (first 4 bytes)
		return messageHeader;
	}
	public announce(): void {
		// Anounce to the peer by sending a version message
		var payload = new Buffer(12);
		// Write version
		// 4 shorts each representing a part of the version
		payload.writeUInt8(this.version.major, 0);
		payload.writeUInt8(this.version.minor, 1);
		payload.writeUInt8(this.version.patch, 2);
		payload.writeUInt8(this.version.revision, 3);
		// Write UNIX time in seconds (JS returns it in milliseconds so divide by 1000)
		payload.writeUInt32BE(Math.round(Date.now() / 1000), 4);
		// Write 32 bit nonce. From Bitcoin protocol: This nonce is used to detect connections to self
		crypto.pseudoRandomBytes(4).copy(payload, 8);

		var header: NodeBuffer = this.generateHeader(commandBytes.version, payload);

		var message = Buffer.concat([header, payload], header.length + payload.length);
		this.socket.write(message);
	}
	private processData(receivedBuffer: NodeBuffer): void {
		if (receivedBuffer.length < 13 || receivedBuffer.readUInt32BE(0) !== magicHeader) {
			Log.warning("Peer with IP " + this.socket.remoteAddress + " sent invalid header");
			return;
		}
		var command = receivedBuffer.readUInt8(4);
		// Check for validity of command
		if (!commandBytes[command]) {
			Log.warning("Peer with IP " + this.socket.remoteAddress + " sent invalid command " + "(" + command.toString(16) + ")");
			return;
		}
		// Check for integrity of payload
		var payloadLength = receivedBuffer.readUInt32BE(5);
		var payload = receivedBuffer.slice(13, 13 + payloadLength); // Node checks for reading past the last value in the buffer
		var checksum = receivedBuffer.slice(9, 13);
		if (crypto.createHash("sha256").update(payload).digest().slice(0, 4).toString() !== checksum.toString()) { // Can't compare buffers directly so compare the .toString()
			Log.warning("Peer with IP " + this.socket.remoteAddress + " sent corrupted or missing data");
			return;
		}
		this.processPayload(command, payload);
	}
	private processPayload(command: number, payload: NodeBuffer): void {
		if (command === commandBytes.versionack) {
			// Other peer acknowledged our version message and wants to connect with us
			this.socket.setTimeout(this.normalTimeout);
			this.connected = true;
			Log.success("Peer with IP " + this.socket.remoteAddress + " acknowledged connection");
		}
	}
	public kill(automatic: boolean = false): void {
		if (!this.socket.remoteAddress)
			return;
		if (automatic) {
			Log.log("Outbound peer with IP " + this.socket.remoteAddress + " disconnected");
		}
		else {
			Log.log("Disconnected from inbound peer with IP " + this.socket.remoteAddress);
		}
		this.stillAlive = false;
		this.socket.end();
	}
}

export = OutboundPeer;