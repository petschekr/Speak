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

interface version {
	major: number; // incompatible API changes
	minor: number; // added functionality in a backwards-compatible manner
	patch: number; // backwards-compatible bug fixes
	revision: number;
}
interface dataHeight {
	name: string;
	height: any; // bignum
}
class InboundPeer {
	private socket: any;
	private isConnected: boolean = false;
	private version: version = {
		"major": 0,
		"minor": 0,
		"patch": 0,
		"revision": 0
	};
	private timeSkew: number = 0; // Seconds
	public connectionNonce: string = undefined;
	public dataHeights: {
		users: any;
		submissions: any;
		comments: any;
		votes: any;
		messages: any;
	} = {
		"users": undefined,
		"submissions": undefined,
		"comments": undefined,
		"votes": undefined,
		"messages": undefined
	};
	private initialTimeout: number = 1000 * 20; // 20 seconds
	private normalTimeout: number = 1000 * 60 * 10; // 10 minutes

	constructor(socket: any) {
		this.socket = socket;
		// New connection
		console.log("Peer with IP ".blue + this.socket.remoteAddress + " connected".blue);
		// Set up event handlers
		this.socket.on("data", this.processData.bind(this));
		this.socket.on("end", this.kill.bind(this, true));
		// Set up timeout for version command
		this.socket.setTimeout(this.initialTimeout, (function(): void {
			// This timout is at first 20 seconds. After receiving a valid version message, the timeout is set to 10 minutes
			console.log("Peer with IP ".red + this.socket.remoteAddress + " timed out".red);
			this.kill();
		}).bind(this));
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
		if (command === commandBytes.version) {
			// Peer is initiating the connection by sending a version command
			// Reject if it's not long enough
			if (payload.length < 22) {
				console.log("Peer with IP ".yellow + this.socket.remoteAddress + " sent invalid version payload; closing connection".yellow);
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
			// Read data heights
			var currentIndex: number = 12;
			var userHeightLength: number = payload.readUInt8(currentIndex);
			this.dataHeights.users = bignum.fromBuffer(payload.slice(++currentIndex, currentIndex += userHeightLength));
			var submissionHeightLength: number = payload.readUInt8(++currentIndex);
			this.dataHeights.submissions = bignum.fromBuffer(payload.slice(++currentIndex, currentIndex += submissionHeightLength));
			var commentHeightLength: number = payload.readUInt8(++currentIndex);
			this.dataHeights.comments = bignum.fromBuffer(payload.slice(++currentIndex, currentIndex += commentHeightLength));
			var voteHeightLength: number = payload.readUInt8(++currentIndex);
			this.dataHeights.votes = bignum.fromBuffer(payload.slice(++currentIndex, currentIndex += voteHeightLength));
			var messageHeightLength: number = payload.readUInt8(++currentIndex);
			this.dataHeights.messages = bignum.fromBuffer(payload.slice(++currentIndex, currentIndex += messageHeightLength));
			// Check if we're happy with this data
			if (this.timeSkew < 3600) { // 1 hour
				this.versionAcknowledge();
				// Disable the inactivity timeout
				this.socket.setTimeout(this.normalTimeout);
			}
		}
	}
	private generateHeader(command: number, payload: NodeBuffer): NodeBuffer {
		var messageHeader = new Buffer(13);
		messageHeader.writeUInt32BE(magicHeader, 0); // Magic number header
		messageHeader.writeUInt8(command, 4); // Command byte
		messageHeader.writeUInt32BE(payload.length, 5); // Payload length (0 for version command)
		crypto.createHash("sha256").update(payload).digest().slice(0, 4).copy(messageHeader, 9); // Hash of payload (first 4 bytes)
		return messageHeader;
	}
	private versionAcknowledge(): void {
		var payload: NodeBuffer = new Buffer(0);
		var header: NodeBuffer = this.generateHeader(commandBytes.versionack, payload);
		var message = Buffer.concat([header, payload], header.length + payload.length);
		this.socket.write(message);
	}
	public kill(automatic: boolean = false): void {
		if (!this.socket.remoteAddress)
			return;
		if (automatic) {
			console.log("Inbound peer with IP " + this.socket.remoteAddress + " disconnected");
		}
		else {
			console.log("Disconnected from inbound peer with IP " + this.socket.remoteAddress);
		}
		this.socket.end();
	}
}

export = InboundPeer;