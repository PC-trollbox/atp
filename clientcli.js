const tcp = require("net");
const emitter = require("./workspace_emitter.js");
const readline = require("readline/promises");
const args = require("util").parseArgs({ allowPositionals: true, strict: false });
const inter = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	prompt: "atp@" + computerConnectInfo().connectString + "> "
});
const _fs = require("fs");
const path = require("path");

function computerConnectInfo() {
	let ip = args.positionals[0] || "localhost";
	if (tcp.isIPv6(ip)) return {
		ip: ip,
		port: args.values.port || 5115,
		connectString: "[" + ip + "]" + (args.values.port ? (":" + args.values.port) : "")
	}
	return {
		ip: ip.split(":")[0],
		port: args.values.port || ip.split(":")[1] || 5115,
		connectString: ip + ((args.values.port || ip.split(":")[1]) ? (":" + (args.values.port || ip.split(":")[1])) : "")
	}
}

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

const srv = tcp.createConnection(computerConnectInfo().port, computerConnectInfo().ip, function () {
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
				try { json = JSON.parse(json); } catch (e) { reject(e) }
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
	await fs.auth(args.values.authmagic || "");
	inter.prompt();
	inter.once("line", async function handlethis(cmd) {
		let commandName = cmd.split(" ")[0];
		let cmdArguments = cmd.split(" ").slice(1);
		if (commandName == "exit") {
			console.log("Your work with server " + computerConnectInfo().connectString + " is marked as complete.");
			srv.destroy();
			process.exit(0);
		} else if (commandName == "ls") {
			console.log("Enumerating files and directories in directory \"" + cmdArguments.join(" ") + "\".");
			try {
				console.log((await fs.readdir(cmdArguments.join(" "))).join("\n"));
			} catch {
				console.error("Error while enumerating files. This directory might not exist, please check.");
			}
		} else if (commandName == "isdir") {
			console.log("Checking \"" + cmdArguments.join(" ") + "\" for directory properties...");
			try {
				await fs.readdir(cmdArguments.join(" "));
				console.log("This is a directory!");
			} catch {
				console.error("This doesn't seem like a directory.");
			}
		} else if (commandName == "ping") {
			console.log("RAW TCP Ping command...");
			srv.write(LONGER_SESSION);
			emitter.goToWorkspace("srvconnect").once("data", function(checkPing) {
				if (checkPing.compare(LONGER_SESSION) == 0) {
					console.log("Pong! Server responded correctly.");
				} else {
					console.error("Oops, something went wrong. Wrong PING signal.");
				}
			})
		} else if (commandName == "download") {
			console.log("Downloading \"" + cmdArguments.join(" ") + "\"...");
			try {
				let file = await fs.readFile(cmdArguments.join(" "));
				console.log("Saving file \"" + cmdArguments.join(" ") + "\"...");
				_fs.writeFileSync(path.basename(cmdArguments.join(" ")), file);
				console.log("File saved!");
			} catch {
				console.error("Oops, something clearly went wrong. Look at our very verbose messages to see where's the problem and begin debugging the protocol...");
			}
		} else if (commandName == "cat") {
			console.log("Downloading \"" + cmdArguments.join(" ") + "\"...");
			try {
				console.log(await fs.readFile(cmdArguments.join(" ")));
			} catch {
				console.error("Oops, something clearly went wrong. Look at our very verbose messages to see where's the problem and begin debugging the protocol...");
			}
		} else if (commandName == "upload") {
			console.log("Restoring \"" + cmdArguments.join(" ") + "\"");
			try {
				let file = _fs.readFileSync(cmdArguments.join(""));
				let fold = await inter.question("Select where to do uploading \"" + path.basename(cmdArguments.join(" ")) + "\": ");
				console.log("Uploading \"" + path.join(fold, cmdArguments.join(" ")) + "\"...");
				await fs.writeFile(path.join(fold, cmdArguments.join(" ")), file);
			} catch {
				console.error("Oops, something clearly went wrong. Look at our very verbose messages to see where's the problem and begin debugging the protocol...");
			}
		} else if (commandName == "rm") {
			console.log("Removing \"" + cmdArguments.join(" ") + "\"");
			try {
				let confirm = await inter.question("Are you sure? The file will be gone FOREVER! Type \"DELETE\" for confirmation: ");
				if (confirm == "DELETE") {
					console.log("Confirming removing to the server...")
					await fs.rm(cmdArguments.join(" "));
				} else {
					console.log("Wrong confirmation string!")
				}
			} catch {
				console.error("Oops, something clearly went wrong. Look at our very verbose messages to see where's the problem and begin debugging the protocol...");
			}
		} else if (commandName == "mkdir") {
			console.log("Creating directory: \"" + cmdArguments.join(" ") + "\"");
			try {
				await fs.mkdir(cmdArguments.join(" "));
			} catch {
				console.error("Oops, something clearly went wrong. Look at our very verbose messages to see where's the problem and begin debugging the protocol...");
			}
		} else if (commandName == "help") {
			console.log("ATP command line");
			console.log("\texit - Exit the command line");
			console.log("\tls [path] - List files in path");
			console.log("\tisdir [path] - Check if the path is a directory or not. Might provide inaccurate results if permissions are messed up.");
			console.log("\tping - Send a basic PING command to the server.");
			console.log("\tdownload [path] - Downloads file from path.");
			console.log("\tcat [path] - Downloads file from path and then prints to regular console.");
			console.log("\tupload [path] - Uploads file from local path. WILL request for a directory.");
			console.log("\trm [path] - Removes a file or directory from remote path.");
			console.log("\tmkdir [path] - Creates a new path.");
			console.log("\thelp - Use \"help\" command to see the description.");
		} else {
			console.error("Wrong command.");
		}
		inter.prompt();
		inter.once("line", handlethis);
	})
});