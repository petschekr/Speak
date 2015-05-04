import crypto = require("crypto"); 
var numCPUs: number = require("os").cpus().length;

function getHashWorker (messageStr: string, difficulty: number, start: number): string {
	var message: Buffer = new Buffer(messageStr, "hex");
	var i = start;
	
	function getRawHash (message: Buffer, nonce: number): Buffer {
		return crypto.createHmac("sha256", nonce.toString()).update(message).digest();
	}
	while (true) {
		var result = getRawHash(message, i);
		if (result.readUInt32BE(0) < difficulty) {
			process.send({"hash": result.toString("hex")});
			return;
		}
		i += numCPUs;
	}
}

process.on("message", function (data) {
	getHashWorker(data.message, data.difficulty, data.start);
});