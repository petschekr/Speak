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

class Peer {
	public ip: string;
	public port: number;

	private _client: any; // net.Socket

	constructor(ip: string, port: number) {
		this.ip = ip;
		this.port = port;
		this.connect();
	}
	public connect(): void {
		this._client = net.connect(this.port, this.ip);
	}
	public announce(): void {
		// Get data height buffers first
		var userHeight: NodeBuffer = bignum(0).toBuffer();
		var userHeightLength: NodeBuffer = new Buffer([userHeight.length]);
		var submissionHeight: NodeBuffer = bignum(0).toBuffer();
		var submissionHeightLength: NodeBuffer = new Buffer([submissionHeight.length]);
		var commentHeight: NodeBuffer = bignum(0).toBuffer();
		var commentHeightLength: NodeBuffer = new Buffer([commentHeight.length]);
		var voteHeight: NodeBuffer = bignum(0).toBuffer();
		var voteHeightLength: NodeBuffer = new Buffer([voteHeight.length]);
		var messageHeight: NodeBuffer = bignum(0).toBuffer();
		var messageHeightLength: NodeBuffer = new Buffer([messageHeight.length]);
		// Anounce to the peer by sending a version message
		var payload = new Buffer(12 + 5 + userHeight.length + submissionHeight.length + commentHeight.length + voteHeight.length + messageHeight.length);
		// Write version 0.0.1-0
		payload.write("00000100", 0, 4, "hex"); // 4 shorts each representing a part of the version
		// Write UNIX time in seconds (JS returns it in milliseconds so divide by 1000)
		payload.writeUInt32BE(Math.round(Date.now() / 1000), 4);
		// Write 32 bit nonce. From Bitcoin protocol: This nonce is used to detect connections to self
		crypto.pseudoRandomBytes(4).copy(payload, 8);
		// Write current user, submission, comment, vote, and message height (in that order)
		// For each, write each BigNum buffer length as a short int. Then, write the buffer
		Buffer.concat([userHeightLength, userHeight, submissionHeightLength, submissionHeight, commentHeightLength, commentHeight, voteHeightLength, voteHeight, messageHeightLength, messageHeight]).copy(payload, 12);

		var header: NodeBuffer = this.generateHeader(commandBytes.version, payload);

		var message = Buffer.concat([header, payload], header.length + payload.length);
		this._client.write(message);
		console.log("Message header sent");
		console.log("Payload:", payload);
	}
	private generateHeader(command: number, payload: NodeBuffer): NodeBuffer {
		var messageHeader = new Buffer(13);
		messageHeader.writeUInt32BE(magicHeader, 0); // Magic number header
		messageHeader.writeUInt8(command, 4); // Command byte
		messageHeader.writeUInt32BE(payload.length, 5); // Payload length (0 for version command)
		crypto.createHash("sha256").update(payload).digest().slice(0, 4).copy(messageHeader, 9); // Hash of payload (first 4 bytes)
		return messageHeader;
	}
}

export = Peer;