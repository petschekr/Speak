/// <reference path="../typescript_defs/node.d.ts" />
/// <reference path="../typescript_defs/colors.d.ts" />
import fs = require("fs");
import path = require("path")

var colors = require("colors");

class Log {
	// Output to console or not
	public silenced: boolean = false;
	public logFilePath: string;
	public writeStream: any; // Writable stream

	constructor(logFileName: string = "speak.log") {
		this.logFilePath = path.join(__dirname, logFileName);
		this.writeStream = fs.createWriteStream(this.logFilePath, {"flags": "a", "encoding": "utf8"}); // Append mode
	}

	private getStringTime(): string {
		return new Date().toString();
	}
	private writeToFile(data: string): void {
		data = this.getStringTime() + " - " + data + "\n";
		this.writeStream.write(data);
	}
	private convertBuffers(data: any[]): any[] {
		for (var i: number = 0; i < data.length; i++) {
			if (Buffer.isBuffer(data[i])) {
				data[i] = data[i].inspect();
			}
		}
		return data;
	}

	// No color; identical to info
	public log(...data: any[]): void {
		data = this.convertBuffers(data);
		var stringData: string = data.join(" ");
		if (!this.silenced)
			console.log(stringData);
		this.writeToFile(stringData);
	}
	public info(...data: any[]): void {
		data = this.convertBuffers(data);
		var stringData: string = data.join(" ");
		// Set color
		var stringDataColorized: string = stringData.blue;
		if (!this.silenced)
			console.log(stringDataColorized);
		this.writeToFile(stringData);
	}
	public success(...data: any[]): void {
		data = this.convertBuffers(data);
		var stringData: string = data.join(" ");
		// Set color
		var stringDataColorized: string = stringData.green;
		if (!this.silenced)
			console.log(stringDataColorized);
		this.writeToFile(stringData);
	}
	public warning(...data: any[]): void {
		data = this.convertBuffers(data);
		var stringData: string = data.join(" ");
		// Set color
		var stringDataColorized: string = stringData.yellow;
		if (!this.silenced)
			console.warn(stringDataColorized);
		this.writeToFile(stringData);
	}
	public error(...data: any[]): void {
		data = this.convertBuffers(data);
		var stringData: string = data.join(" ");
		// Set color
		var stringDataColorized: string = stringData.red;
		if (!this.silenced)
			console.error(stringDataColorized);
		this.writeToFile(stringData);
	}

	public begin(): void {
		this.writeStream.write("================================ Begin logging at " + new Date().toString() + " ================================\n");
	}
}

export = Log;