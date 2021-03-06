/// <reference path="../typescript_defs/node.d.ts" />
/// <reference path="../typescript_defs/colors.d.ts" />
import crypto = require("crypto");
import net = require("net");

import Logging = require("./logging");
var Log: Logging = new Logging();

var colors = require("colors");

var magicHeader: number = 0xD6EE2BE9;
enum commandBytes {
	"version" = 0x1,
	"versionack" = 0x2,
	"addresses" = 0x3,
	"inventory" = 0x4,
	"getdata" = 0x5
}
var defaultPort: number = 8555;

interface version {
	major: number; // incompatible API changes
	minor: number; // added functionality in a backwards-compatible manner
	patch: number; // backwards-compatible bug fixes
	revision: number;
}
class InboundPeer {
	private socket: any;
	private db: any;

	private masterNode: boolean = false;
	private version: version = {
		"major": undefined,
		"minor": undefined,
		"patch": undefined,
		"revision": undefined
	};
	private timeSkew: number = 0; // Seconds
	public connectionNonce: string = undefined;

	private initialTimeout: number = 1000 * 20; // 20 seconds
	private normalTimeout: number = 1000 * 60 * 10; // 10 minutes

	private _pendingReceive: boolean = false;
	private _pendingReceiveBuffer: Buffer = new Buffer(0);
	private _pendingReceiveBufferFinalSize: number = undefined;

	public stillAlive: boolean = true;

	constructor(socket: any, db: any) {
		this.socket = socket;
		this.db = db;
		// New connection
		Log.info("Peer with IP " + this.socket.remoteAddress + " connected");
		// Set up event handlers
		this.socket.on("data", this.processRawTCPData.bind(this));
		this.socket.on("end", this.kill.bind(this, true));
		// Set up timeout for version command
		this.socket.setTimeout(this.initialTimeout, (function(): void {
			// This timout is at first 20 seconds. After receiving a valid version message, the timeout is set to 10 minutes
			Log.error("Peer with IP " + this.socket.remoteAddress + " timed out");
			this.kill();
		}).bind(this));
	}
	private processRawTCPData(receivedBuffer: Buffer): void {
		Log.log("Received:", receivedBuffer, receivedBuffer.length);

		if (this._pendingReceive) {
			// Waiting for more packets to fill out the entire payload
			this._pendingReceiveBuffer = Buffer.concat([this._pendingReceiveBuffer, receivedBuffer]);
			if (this._pendingReceiveBuffer.length >= this._pendingReceiveBufferFinalSize) {
				this.processData(this._pendingReceiveBuffer);
				this._pendingReceive = false;
				this._pendingReceiveBufferFinalSize = undefined;
			}
		}
		else {
			// Not currently waiting for any more packets
			if (receivedBuffer.length < 13 || receivedBuffer.readUInt32BE(0) !== magicHeader) {
				Log.warning("Peer with IP " + this.socket.remoteAddress + " sent invalid header");
				return;
			}
			var payloadLength = receivedBuffer.readUInt32BE(5);
			if (receivedBuffer.length < payloadLength) {
				// We're waiting for the next packet(s) to arrive as part of the message
				this._pendingReceiveBuffer = receivedBuffer;
				this._pendingReceive = true;
				this._pendingReceiveBufferFinalSize = payloadLength + 13; // Header is 13 bytes
			}
			else {
				this.processData(receivedBuffer);
			}
		}
	}
	private processData(receivedBuffer: Buffer): void {
		Log.log("Processing:", receivedBuffer, receivedBuffer.length);

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
		Log.success("Peer with IP " + this.socket.remoteAddress + " sent data successfully");
		this.processPayload(command, payload);
	}
	private processPayload(command: number, payload: Buffer): void {
		if (command === commandBytes.version) {
			// Peer is initiating the connection by sending a version command
			// Reject if it's not long enough
			if (payload.length < 12) {
				Log.warning("Peer with IP " + this.socket.remoteAddress + " sent invalid version payload; closing connection");
				this.kill();
				return;
			}
			this.version.major = payload.readUInt8(0);
			this.version.minor = payload.readUInt8(1);
			this.version.patch = payload.readUInt8(2);
			this.version.revision = payload.readUInt8(3);
			var peerTime: number = payload.readUInt32BE(4);
			this.timeSkew = peerTime - Math.round(Date.now() / 1000);
			this.connectionNonce = payload.slice(8, 12).toString("hex");
			// Check if we're happy with this data
			if (this.timeSkew < 3600) { // 1 hour
				this.versionAcknowledge();
				// Disable the inactivity timeout
				this.socket.setTimeout(this.normalTimeout);
			}
			else {
				Log.warning("Peer with IP " + this.socket.remoteAddress + " has a clock skew of > 1 hour; closing connection");
				this.kill();
			}
		}
	}
	private generateHeader(command: number, payload: Buffer): Buffer {
		var messageHeader = new Buffer(13);
		messageHeader.writeUInt32BE(magicHeader, 0); // Magic number header
		messageHeader.writeUInt8(command, 4); // Command byte
		messageHeader.writeUInt32BE(payload.length, 5); // Payload length (0 for version command)
		crypto.createHash("sha256").update(payload).digest().slice(0, 4).copy(messageHeader, 9); // Hash of payload (first 4 bytes)
		return messageHeader;
	}
	private versionAcknowledge(): void {
		var payload: Buffer = new Buffer(0);
		var header: Buffer = this.generateHeader(commandBytes.versionack, payload);
		var message = Buffer.concat([header, payload], header.length + payload.length);
		this.socket.write(message);
	}
	public kill(automatic: boolean = false): void {
		if (!this.socket.remoteAddress)
			return;
		if (automatic) {
			Log.log("Inbound peer with IP " + this.socket.remoteAddress + " disconnected");
		}
		else {
			Log.log("Disconnected from inbound peer with IP " + this.socket.remoteAddress);
		}
		this.stillAlive = false;
		this.socket.end();
	}
}

export = InboundPeer;