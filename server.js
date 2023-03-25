const tcp = require("net");
const fs = require("fs");
const emitter = require("./workspace_emitter.js");

// singleinfo
const REAUTH_SUCCESS = Buffer.from([1, 0].map(a => String.fromCharCode(a)).join(""));
const AUTH_SUCCESS = Buffer.from([2, 0].map(a => String.fromCharCode(a)).join(""));
const FILE_WRITE_SUCCESS = Buffer.from([5, 0].map(a => String.fromCharCode(a)).join(""));
const FOLDER_CREATE_SUCCESS = Buffer.from([6, 0].map(a => String.fromCharCode(a)).join(""));
const REMOVE_SUCCESS = Buffer.from([7, 0].map(a => String.fromCharCode(a)).join(""));
// multiinfo
const ERROR_HANDLING = Buffer.from([255, 23, 0].map(a => String.fromCharCode(a)).join(""));
const TERMINATE_REAUTH = Buffer.from([1, 22, 0].map(a => String.fromCharCode(a)).join(""));
const WAITING_CONTENT = Buffer.from([5, 24, 0].map(a => String.fromCharCode(a)).join(""));
// partialinfo
const DIR_START = Buffer.from([3].map(a => String.fromCharCode(a)).join(""));
const END = Buffer.from([0].map(a => String.fromCharCode(a)).join(""));
const FILE_START = Buffer.from([4].map(a => String.fromCharCode(a)).join(""));
const AUTH = Buffer.from([2].map(a => String.fromCharCode(a)).join(""));

const ro = false;
const authmagic = Buffer.from("");

const srv = tcp.createServer(function (socket) {
	console.log(socket.remoteAddress, "connected");
	let workspace = emitter.goToWorkspace(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16));

	function terminateSocket() {
		console.log(socket.remoteAddress, "didn't PING on time");
		socket.write(TERMINATE_REAUTH);
		socket.destroy();
	}
	let terminateIn = setTimeout(terminateSocket, 10_000);
	let disableVentHandling = false;
	let unauth = true;

	workspace.on("data", function (bitflag) { // vent handling (can't be disabled)
		if (bitflag[0] == 1) {
			clearTimeout(terminateIn);
			terminateIn = setTimeout(terminateSocket, 10_000);
			socket.write(REAUTH_SUCCESS);
			console.log(socket.remoteAddress, "sent PING");
		} else if (bitflag[0] == 2) {
			console.log(socket.remoteAddress, "sent AUTH");
			if (Buffer.concat([AUTH, authmagic, END]).compare(bitflag) == 0) {
				console.log(socket.remoteAddress, "AUTHed correctly");
				socket.write(AUTH_SUCCESS);
				unauth = false;
			} else {
				console.log(socket.remoteAddress, "didn't AUTH correctly");
				socket.write(ERROR_HANDLING);
			}
		}
	});


	workspace.on("data", function (bitflag) { // vent handling (can be disabled)
		if (unauth) return;
		if (!disableVentHandling) {
			if (bitflag[0] == 3) { // enum files
				let dir_name = bitflag.slice(1).toString();
				dir_name = dir_name.split("", dir_name.length - 1);
				dir_name = dir_name.join("");
				console.log(socket.remoteAddress, "is enuming files in", dir_name);
				try {
					socket.write(DIR_START);
					let files = fs.readdirSync(dir_name);
					socket.write(JSON.stringify(files));
					socket.write(END);
				} catch {
					socket.write(ERROR_HANDLING);
				}
			} else if (bitflag[0] == 4) { // read files
				let file_name = bitflag.slice(1).toString();
				file_name = file_name.split("", file_name.length - 1);
				file_name = file_name.join("");
				console.log(socket.remoteAddress, "is reading file", file_name);
				try {
					socket.write(FILE_START);
					let file = fs.readFileSync(file_name);
					socket.write(file.toString());
					socket.write(END);
				} catch {
					socket.write(ERROR_HANDLING);
				}
			} else if (bitflag[0] == 5) { // write files
				let file_name = bitflag.slice(1).toString();
				file_name = file_name.split("", file_name.length - 1);
				file_name = file_name.join("");
				console.log(socket.remoteAddress, "is writing file", file_name);
				disableVentHandling = true;
				setTimeout(function () {
					socket.write(WAITING_CONTENT);
					workspace.once("data", function (file_content) {
						file_content = file_content.toString();
						file_content = file_content.split("", file_content.length - 1);
						file_content = file_content.join("");
						disableVentHandling = false;
						try {
							if (!ro) fs.writeFileSync(file_name, file_content);
							socket.write(FILE_WRITE_SUCCESS);
						} catch {
							socket.write(ERROR_HANDLING);
						}
					});
				}, 500);
			} else if (bitflag[0] == 6) { // make directory
				let dir_name = bitflag.slice(1).toString();
				dir_name = dir_name.split("", dir_name.length - 1);
				dir_name = dir_name.join("");
				console.log(socket.remoteAddress, "is creating directory in", dir_name);
				try {
					if (!ro) fs.mkdirSync(dir_name, {
						recursive: true
					});
					socket.write(FOLDER_CREATE_SUCCESS);
				} catch {
					socket.write(ERROR_HANDLING);
				}
			} else if (bitflag[0] == 7) { // rm
				let item_name = bitflag.slice(1).toString();
				item_name = item_name.split("", item_name.length - 1);
				item_name = item_name.join("");
				console.log(socket.remoteAddress, "is removing a file", item_name);
				try {
					if (!ro) fs.rmSync(item_name, {
						recursive: true,
						force: true
					});
					socket.write(REMOVE_SUCCESS);
				} catch {
					socket.write(ERROR_HANDLING);
				}
			}
		}
	});
	function done() {
		clearTimeout(terminateIn);
		console.log(socket.remoteAddress, "disconnected or errored out");
	}
	socket.on("error", done);
	socket.on("close", done);

	let dataChunk = Buffer.from("");
	socket.on("data", function (e) {
		dataChunk = Buffer.concat([dataChunk, e]);
		if (dataChunk[dataChunk.byteLength - 1] == 0) {
			let dataChunkSnaph = Buffer.from(dataChunk.toString("latin1"), "latin1");
			setTimeout(function () {
				workspace.emit("data", dataChunkSnaph);
			}, 100);
			dataChunk = Buffer.from("");
		}
	});
})
srv.listen(5115)