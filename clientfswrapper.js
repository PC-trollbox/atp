const tcp = require("net");
const emitter = require("./workspace_emitter.js");

// singleinfo
const LONGER_SESSION = Buffer.from([1, 0].map(a => String.fromCharCode(a)).join(""));
const AUTH_SUCCESS = Buffer.from([2, 0].map(a => String.fromCharCode(a)).join(""));
const DIR_START = Buffer.from([3].map(a => String.fromCharCode(a)).join(""));
// multiinfo
const WAITING_CONTENT = Buffer.from([5, 24, 0].map(a => String.fromCharCode(a)).join(""));
// partialinfo
const END = Buffer.from([0].map(a => String.fromCharCode(a)).join(""));
const FILE_START = Buffer.from([4].map(a => String.fromCharCode(a)).join(""));
const FILE_WRITE = Buffer.from([5].map(a => String.fromCharCode(a)).join(""));
const AUTH = Buffer.from([2].map(a => String.fromCharCode(a)).join(""));
const MKDIR = Buffer.from([6].map(a => String.fromCharCode(a)).join(""));
const RM = Buffer.from([7].map(a => String.fromCharCode(a)).join(""));

fs = {
	hookOnAvailable: function (func) {
		let workspace = emitter.goToWorkspace("srvfs");
		workspace.once("available", func);
	},
	get _work() {
		return emitter.goToWorkspace("srvfs");
	}
}

const srv = tcp.createConnection(5115, "localhost", function () {
	let workspace = emitter.createWorkspace("srvconnect");
	let dataChunk = Buffer.from("");
	srv.on("data", function (e) {
		dataChunk = Buffer.concat([dataChunk, e]);
		if (dataChunk[dataChunk.byteLength - 1] == 0) {
			let dataChunkSnaph = Buffer.from(dataChunk.toString("latin1"), "latin1");
			setTimeout(function () {
				workspace.emit("data", dataChunkSnaph);
			}, 100);
			dataChunk = Buffer.from("");
		}
	});

	setInterval(function () {
		srv.write(LONGER_SESSION);
	}, 5000);

	fs.auth = function (authmagic) {
		return new Promise(function (resolve, reject) {
			srv.write(Buffer.concat([AUTH, Buffer.from(authmagic, "latin1"), END]));
			workspace.once("data", function (buf) {
				if (buf.compare(AUTH_SUCCESS) == 0) {
					fs._work.emit("available", "yep");
					resolve("available");
				}
			});
		});
	}
	fs.readdir = function (dir) {
		return new Promise(function (resolve, reject) {
			srv.write(DIR_START);
			srv.write(dir);
			srv.write(END);
			workspace.once("data", function (e) {
				if (e[0] != 3) return reject("bad receiver");
				let json = e.slice(1).toString();
				json = json.split("", json.length - 1);
				json = json.join("");
				json = JSON.parse(json);
				resolve(json);
			});
		})
	};
	fs.readFile = function (fileN) {
		return new Promise(function (resolve, reject) {
			srv.write(FILE_START);
			srv.write(fileN);
			srv.write(END);
			workspace.once("data", function (e) {
				if (e[0] != 4) return reject("bad receiver");
				let file = e.slice(1).toString();
				file = file.split("", file.length - 1);
				file = file.join("");
				resolve(file);
			});
		})
	}
	fs.writeFile = function (fileN, cnt) {
		return new Promise(function (resolve, reject) {
			srv.write(FILE_WRITE);
			srv.write(fileN);
			srv.write(END);
			workspace.once("data", function (e) {
				if (WAITING_CONTENT.compare(e) != 0) return reject("bad receiver");
				srv.write(cnt);
				srv.write(END);
				setTimeout(function () {
					workspace.once("data", function () {
						resolve("");
					});
				}, 100)
			});
		})
	}
	fs.mkdir = function (dir) {
		return new Promise(function (resolve, reject) {
			srv.write(MKDIR);
			srv.write(dir);
			srv.write(END);
			workspace.once("data", function (e) {
				if (e[0] != MKDIR[0]) return reject("bad receiver");
				resolve("");
			});
		})
	};
	fs.rm = function (item) {
		return new Promise(function (resolve, reject) {
			srv.write(RM);
			srv.write(item);
			srv.write(END);
			workspace.once("data", function (e) {
				if (e[0] != RM[0]) return reject("bad receiver");
				resolve("");
			});
		})
	};
	srv.on("error", (e) => console.log("trouble", e));
});

srv.once("connect", async function () {
	await fs.auth("");
	//use here!
	console.log("files!", await fs.readdir("."));
	console.log("source code ./server.js:", await fs.readFile("./server.js"));
	await fs.writeFile("./myfile.js", "console.log('hello world, time of recording is', new Date(" + Date.now() + ").toString());");
	console.log("written a ./myfile.js");
	await fs.mkdir("./files");
	console.log("created dir");
	await fs.rm("./myfile.js")
	console.log("removed a file");
	await fs.writeFile("./files/myfile.js", "console.log('hello world, time of recording is', new Date(" + Date.now() + ").toString());");
	console.log("created a file inside ./files");
	console.log("files 2!", await fs.readdir("./files"));
	await fs.rm("./files")
	console.log("removed ./files");
	console.log("=== DEMO FINISHED ===");
	process.exit(0);
});