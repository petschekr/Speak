/// <reference path="../typescript_defs/node.d.ts" />
import fs = require("fs");
import crypto = require("crypto");
import child_process = require("child_process");
var numCPUs: number = require("os").cpus().length;

function getHash(message: Buffer, difficulty: number, callback: (err: Error, hash: Buffer) => any): void {
	if (!message || !difficulty || !callback) {
		throw new Error("Missing arguments");
	}
	var threadPool: any[] = [];
	
	for (var i = 0; i < numCPUs; i++) {
		var thread = child_process.fork(__dirname + "/hashingWorker.js");
		thread.on("message", function (hash: {hash: string;}): void {
			// Kill all of the threads
			for (var i = 0; i < threadPool.length; i++) {
				threadPool[i].kill();
			}
			callback(null, new Buffer(hash.hash, "hex"));
		});
		thread.send({
			"message": message.toString("hex"),
			"difficulty": difficulty,
			"start": i
		});
		threadPool.push(thread);
	}
}

exports.getHash = getHash;