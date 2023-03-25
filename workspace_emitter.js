module.exports = {
	workspaces: {},
	createWorkspace: function (vm) {
		return this.workspaces[vm] = {
			emit: function (e, ...mit) {
				if (e == "deletion") throw new Error("impossible");
				if (!e) throw new Error("get me some events");
				if (typeof e !== "string") throw new Error("omg this is really impossible to emit " + String(typeof e));
				if (this.callbacks.hasOwnProperty(e)) {
					for (let callback of this.callbacks[e]) {
						callback(...mit)
					}
				}
			},
			on: function (e, mit) {
				if (!e) throw new Error("get me some events");
				if (typeof e !== "string") throw new Error("omg this is really impossible to emit " + String(typeof e));
				if (typeof mit !== "function") throw new Error("omg this is really impossible to catch using " + String(typeof mit));
				if (!this.callbacks.hasOwnProperty(e)) this.callbacks[e] = [];
				this.callbacks[e].push(mit);
			},
			once: function (e, mit) {
				if (!e) throw new Error("get me some events");
				if (typeof e !== "string") throw new Error("omg this is really impossible to emit " + String(typeof e));
				if (typeof mit !== "function") throw new Error("omg this is really impossible to catch using " + String(typeof mit));
				if (!this.callbacks.hasOwnProperty(e)) this.callbacks[e] = [];
				let blocking = false;
				let regNum = this.callbacks[e].push(function (e, ...mit2) {
					if (blocking) return;
					blocking = true;
					mit(e, ...mit2);
				});
			},
			callbacks: {}
		}
	},
	goToWorkspace: function (vm) {
		return this.workspaces[vm] || this.createWorkspace(vm);
	},
	removeWorkspace: function (vm) {
		if (!this.workspaces[vm]) this.workspaces[vm] = {
			callbacks: {}
		};
		if (this.workspaces[vm].callbacks.hasOwnProperty("deletion")) {
			for (let callback of this.workspaces[vm].callbacks["deletion"]) {
				callback("");
			}
		}
		delete this.workspaces[vm];
	}
}