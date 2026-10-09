/**
 * Copyright 2016 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * Authors:
 *	- Olaf Hahn
 **/


module.exports = function(RED) {
	"use strict";

	var settings = RED.settings;
	var execFile = require("child_process").execFile;
	var captureTimeout = 30000;	// ms before a hung rpicam-still is killed

	// rpicam-still only knows these; anything else falls back to its default
	var encodings = { jpeg: "jpg", jpg: "jpg", png: "png", bmp: "bmp", rgb: "rgb", yuv: "yuv420" };
	var exposures = { auto: "normal", sports: "sport", night: "long", nightpreview: "long", verylong: "long" };
	var awbs = { auto: "auto", sunlight: "daylight", cloudy: "cloudy", shade: "cloudy", tungsten: "tungsten",
		fluorescent: "fluorescent", incandescent: "incandescent", flash: "daylight", horizon: "tungsten" };


	// CameraPI Take Photo Node
	function CameraPiTakePhotoNode(config) {
		// Create this node
		RED.nodes.createNode(this,config);

		// set parameters and save locally
		this.filemode = config.filemode;
		this.filename =  config.filename;
		this.filedefpath = config.filedefpath;
		this.filepath = config.filepath;
		this.fileformat = config.fileformat;
		this.resolution =  config.resolution;
		this.rotation = config.rotation;
		this.fliph = config.fliph;
		this.flipv = config.flipv;
		this.sharpness = config.sharpness;
		this.brightness = config.brightness;
		this.contrast = config.contrast;
		this.imageeffect = config.imageeffect;
		this.exposuremode = config.exposuremode;
		this.iso = config.iso;
		this.agcwait = config.agcwait;
		this.quality = config.quality;
		this.led = config.led;
		this.awb = config.awb;
		this.name =  config.name;
		this.activeProcesses = {};

		var node = this;

		// if there is an new input
		node.on("input", function(msg) {

			var fsextra = require("fs-extra");
			var fs = require("fs");
			const { v4: uuidv4 } = require('uuid');
			var uuid = uuidv4();
			var os = require("os");
			var homedir = os.homedir();
			var defdir = homedir + "/Pictures/";
			var args = ["--nopreview"];
			var resolution;
			var fileformat;
			var filename;
			var filepath;
			var filemode;
			var filefqn;
			var fliph, flipv;
			var sharpness;
			var brightness;
			var contrast;
			var agcwait;
			var quality;
			var awb;
			var rotation;
			var exposuremode;
			var iso;

			// One camera: a second capture can't get it while the first holds it
			if (Object.keys(node.activeProcesses).length > 0) {
				node.error("CameraPi: capture already running, request dropped", msg);
				return;
			}

			node.status({fill:"green",shape:"dot",text:"capturing"});

			// Check the given filemode
			if((msg.filemode) && (msg.filemode !== "")) {
				filemode = msg.filemode;
			} else {
				if (node.filemode) {
					filemode = node.filemode;
				} else {
					filemode = "1";
				}
			}

			if (filemode == "0") {
				// Buffered mode (old Buffermode)
				filename = "pic_" + uuid + ".jpg";
				fileformat = "jpeg";
				filepath = homedir + "/";
				if (RED.settings.verbose) { node.log("camerapi takephoto:" + filepath + filename); }
			} else if (filemode == "2") {
				// Auto file name mode (old Generate)
				filename = "pic_" + uuid + ".jpg";
				fileformat = "jpeg";
				filepath = defdir;
				if (RED.settings.verbose) { node.log("camerapi takephoto:" + filepath + filename); }
			} else {
				 // Specific FileName
				 if ((msg.filename) && (msg.filename.trim() !== "")) {
						filename = msg.filename;
				} else {
					if (node.filename) {
						filename = node.filename;
					} else {
						filename = "pic_" + uuid + ".jpg";
					}
				}

				if (node.filedefpath == "1" ) {
					filepath = defdir;
				} else {
					if ((msg.filepath) && (msg.filepath.trim() !== "")) {
						filepath = msg.filepath;
					} else {
						if (node.filepath) {
							filepath = node.filepath;
						} else {
							filepath = defdir;
						}
					}
				}

				if ((msg.fileformat) && (msg.fileformat.trim() !== "")) {
					fileformat = msg.fileformat;
				} else {
					if (node.fileformat) {
						fileformat = node.fileformat;
					} else {
						fileformat = "jpeg";
					}
				}
			}
			filefqn = filepath + filename;
			if (!encodings[fileformat]) {
				node.warn("CameraPi: format " + fileformat + " not supported by rpicam-still, using jpeg");
				fileformat = "jpeg";
			}
			args.push("--encoding", encodings[fileformat], "--output", filefqn);

			// Resolution of the image
			if ((msg.resolution) && (msg.resolution !== "")) {
				resolution = msg.resolution;
			} else {
				if (node.resolution) {
					resolution = node.resolution;
				} else {
					resolution = "10";
				}
			}
			var sizes = { "1": [320, 240], "2": [640, 480], "3": [800, 600], "4": [1024, 768],
				"5": [1280, 720], "6": [1640, 922], "7": [1640, 1232], "8": [1920, 1080], "9": [2592, 1944] };
			var size = sizes[resolution] || [3280, 2464];
			args.push("--width", size[0], "--height", size[1]);

			// rotation – rpicam-still only does 0 and 180
			if ((msg.rotation) && (msg.rotation !== "")) {
				rotation = msg.rotation;
				} else {
					if (node.rotation) {
						rotation = node.rotation;
					} else {
						rotation = "0";
					}
				}
			if (rotation == "180") {
				args.push("--rotation", "180");
			} else if (rotation != "0") {
				node.warn("CameraPi: rotation " + rotation + " not supported by rpicam-still, ignored");
			}

			// hflip and vflip
			if ((msg.fliph) && (msg.fliph !== "")) {
				fliph = msg.fliph;
			} else {
				if (node.fliph) {
					fliph = node.fliph;
				} else {
					fliph = "1";
				}
			}
			if ((msg.flipv) && (msg.flipv !== "")) {
				flipv = msg.flipv;
			} else {
				if (node.flipv) {
					flipv = node.flipv;
				} else {
					flipv= "1";
				}
			}
			if (fliph == "1") { args.push("--hflip"); }
			if (flipv == "1") { args.push("--vflip"); }

			// brightness – 0..100 (50 neutral) to rpicam's -1..1
			if ((msg.brightness) && (msg.brightness !== "")) {
				brightness = msg.brightness;
			} else {
				if (node.brightness) {
					brightness = node.brightness;
				} else {
					brightness = "50";
				}
			}
			args.push("--brightness", (Number(brightness) - 50) / 50);

			// contrast – -100..100 (0 neutral) to rpicam's 0..2 (1 neutral)
			if ((msg.contrast) && (msg.contrast !== "")) {
				contrast = msg.contrast;
			} else {
				if (node.contrast) {
					contrast = node.contrast;
				} else {
					contrast = "0";
				}
			}
			args.push("--contrast", 1 + Number(contrast) / 100);

			// sharpness – same scaling as contrast
			if ((msg.sharpness) && (msg.sharpness !== "")) {
				sharpness = msg.sharpness;
			} else {
				if (node.sharpness) {
					sharpness = node.sharpness;
				} else {
					sharpness = "0";
				}
			}
			args.push("--sharpness", 1 + Number(sharpness) / 100);

			// exposure-mode
			if ((msg.exposuremode) && (msg.exposuremode !== "")) {
				exposuremode = msg.exposuremode;
				} else {
					if (node.exposuremode) {
						exposuremode = node.exposuremode;
					} else {
						exposuremode = "auto";
					}
				}
			args.push("--exposure", exposures[exposuremode] || "normal");

			// iso – 0 = auto, otherwise analogue gain ≈ ISO / 100
			if ((msg.iso) && (msg.iso !== "")) {
				iso = msg.iso;
			} else {
				if (node.iso) {
					iso = node.iso;
				} else {
					iso = "0";
				}
			}
			if (Number(iso) > 0) { args.push("--gain", Number(iso) / 100); }

			// agcwait – seconds the auto exposure/white balance gets to settle before the capture
			if ((msg.agcwait) && (msg.agcwait !== "")) {
				agcwait = msg.agcwait;
			} else {
				if (node.agcwait) {
					agcwait = node.agcwait;
				} else {
					agcwait = 1.0;
				}
			}
			args.push("--timeout", Math.max(100, Math.round(Number(agcwait) * 1000)));

			// jpeg quality
			if ((msg.quality) && (msg.quality !== "")) {
				quality = msg.quality;
			} else {
				if (node.quality) {
					quality = node.quality;
				} else {
					quality = 80;
				}
			}
			args.push("--quality", quality);

			// awb
			if ((msg.awb) && (msg.awb != "")) {
				awb = msg.awb;
			} else {
				if (node.awb) {
					awb = node.awb;
				} else {
					awb = "auto";
				}
			}
			args.push("--awb", awbs[awb] || "auto");

			// image effect and LED have no rpicam-still equivalent and are ignored

			if (RED.settings.verbose) { node.log("rpicam-still " + args.join(" ")); }

			// execFile: no shell, so msg.filename/filepath can't inject commands
			var child = execFile("rpicam-still", args.map(String), {timeout: captureTimeout, killSignal: "SIGKILL"}, function (error, stdout, stderr) {
				delete node.activeProcesses[child.pid];
				if (error !== null) {
					var reason = error.killed ? "timed out after " + captureTimeout / 1000 + " s" : error.message;
					console.error("CameraPi (err): " + reason + " " + stderr);
					node.status({fill:"red",shape:"ring",text:error.killed ? "timed out" : "failed"});
					node.error("CameraPi: capture " + reason, msg);
					return;
				}
				msg.filename = filename;
				msg.filepath = filepath;
				msg.fileformat = fileformat;

				// get the raw image into payload and delete tempfile on buffermode
				if (filemode == "0") {
					// put the imagefile into payload
					msg.payload = fs.readFileSync(filefqn);

					// delete tempfile
					fsextra.remove(filefqn, function(err) {
					  if (err) return console.error("CameraPi (err): " + err);
					  console.log("CameraPi (log): " + filefqn + " remove success!")
					});
				} else {
					msg.payload = filefqn;
					console.log("CameraPi (log): " + filefqn + " written with success!")
				}

				node.status({});
				node.send(msg);
			});

			child.on("error",function(){});

			node.activeProcesses[child.pid] = child;

		});

		// CameraPi-TakePhoto has a close
		// New function signature function(removed, done) included in Node-Red 0.17
		node.on("close", function(removed, done) {
			if (removed) {
				// This node has been deleted
				node.closing = true;
			}
			else {
				// This node is being restarted
			}
			// Don't leave a capture holding the camera across a redeploy
			for (var pid in node.activeProcesses) {
				node.activeProcesses[pid].kill("SIGKILL");
			}
			node.activeProcesses = {};
			done();
		});
	}
	RED.nodes.registerType("camerapi-takephoto",CameraPiTakePhotoNode);
}
