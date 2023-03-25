const tcp = require("net");
const emitter = require("./workspace_emitter.js");

const LONGER_SESSION = Buffer.from([1, 0].map(a => String.fromCharCode(a)).join(""));
const AUTH_SESSION = Buffer.from([2, 0].map(a => String.fromCharCode(a)).join(""));
const AUTH_SUCCESS = Buffer.from([2, 0].map(a => String.fromCharCode(a)).join(""));
const DIR = Buffer.concat([
	Buffer.from([3].map(a => String.fromCharCode(a)).join("")),
	Buffer.from("."),
	Buffer.from([0].map(a => String.fromCharCode(a)).join(""))
]);

const srv = tcp.createConnection(5115, "localhost", function () {
	let workspace = emitter.createWorkspace("srvconnect");
	srv.write(AUTH_SESSION);
	let dataChunk = Buffer.from("");
	srv.on("data", function (e) {
		console.log(e);
		dataChunk = Buffer.concat([dataChunk, e]);
		if (dataChunk[dataChunk.byteLength - 1] == 0) {
			workspace.emit("data", dataChunk);
			dataChunk = Buffer.from("");
		}
	});

	workspace.on("data", e => console.log("data", e))

	workspace.once("data", function (e) {
		if (e.compare(AUTH_SUCCESS) == 0) {
			console.log("Auth success, waiting for commands");
			setInterval(function () {
				srv.write(LONGER_SESSION);
			}, 5000)
			srv.write(DIR);
			srv.on("error", (e) => console.log("trouble", e));
		} else {
			console.log("Got invalid output, sry.");
			srv.destroy();
		}
	})
});