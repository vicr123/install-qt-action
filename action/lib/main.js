"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto = __importStar(require("crypto"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const process = __importStar(require("process"));
const cache = __importStar(require("@actions/cache"));
const core = __importStar(require("@actions/core"));
const exec_1 = require("@actions/exec");
const glob = __importStar(require("glob"));
const compare_versions_1 = require("compare-versions");
const nativePath = process.platform === "win32" ? path.win32.normalize : path.normalize;
const compareVersions = (v1, op, v2) => {
    return (0, compare_versions_1.compare)(v1, v2, op);
};
const setOrAppendEnvVar = (name, value) => {
    const oldValue = process.env[name];
    let newValue = value;
    if (oldValue) {
        newValue = `${oldValue}:${newValue}`;
    }
    core.exportVariable(name, newValue);
};
const execPython = (command, args) => __awaiter(void 0, void 0, void 0, function* () {
    const python = process.platform === "win32" ? "python" : "python3";
    return (0, exec_1.exec)(`${python} -m ${command} ${args.join(" ")}`);
});
const locateQtArchDir = (installDir) => {
    // For 6.4.2/gcc, qmake is at 'installDir/6.4.2/gcc_64/bin/qmake'.
    // This makes a list of all the viable arch directories that contain a qmake file.
    const qtArchDirs = glob
        .sync(`${installDir}/[0-9]*/*/bin/qmake*`)
        .map((s) => s.replace(/\/bin\/qmake[^/]*$/, ""));
    // For Qt6 mobile and wasm installations, and Qt6 Windows on ARM installations,
    // a standard desktop Qt installation must exist alongside the requested architecture.
    // In these cases, we must select the first item that ends with 'android*', 'ios', 'wasm*' or 'msvc*_arm64'.
    const requiresParallelDesktop = qtArchDirs.filter((p) => p.match(/6\.\d+\.\d+\/(android[^/]*|ios|wasm[^/]*|msvc[^/]*_arm64)$/));
    if (requiresParallelDesktop.length) {
        // NOTE: if multiple mobile/wasm installations coexist, this may not select the desired directory
        return requiresParallelDesktop[0];
    }
    else if (!qtArchDirs.length) {
        throw Error(`Failed to locate a Qt installation directory in  ${installDir}`);
    }
    else {
        // NOTE: if multiple Qt installations exist, this may not select the desired directory
        return qtArchDirs[0];
    }
};
class Inputs {
    constructor() {
        const host = core.getInput("host");
        // Set host automatically if omitted
        if (!host) {
            switch (process.platform) {
                case "win32": {
                    this.host = "windows";
                    break;
                }
                case "darwin": {
                    this.host = "mac";
                    break;
                }
                default: {
                    this.host = "linux";
                    break;
                }
            }
        }
        else {
            // Make sure host is one of the allowed values
            if (host === "windows" || host === "mac" || host === "linux") {
                this.host = host;
            }
            else {
                throw TypeError(`host: "${host}" is not one of "windows" | "mac" | "linux"`);
            }
        }
        const target = core.getInput("target");
        // Make sure target is one of the allowed values
        if (target === "desktop" || target === "android" || target === "ios") {
            this.target = target;
        }
        else {
            throw TypeError(`target: "${target}" is not one of "desktop" | "android" | "ios"`);
        }
        // An attempt to sanitize non-straightforward version number input
        this.version = core.getInput("version");
        this.arch = core.getInput("arch");
        // Set arch automatically if omitted
        if (!this.arch) {
            if (this.host === "windows") {
                if (compareVersions(this.version, ">=", "5.15.0")) {
                    this.arch = "win64_msvc2019_64";
                }
                else if (compareVersions(this.version, "<", "5.6.0")) {
                    this.arch = "win64_msvc2013_64";
                }
                else if (compareVersions(this.version, "<", "5.9.0")) {
                    this.arch = "win64_msvc2015_64";
                }
                else {
                    this.arch = "win64_msvc2017_64";
                }
            }
            else if (this.target === "android") {
                if (compareVersions(this.version, ">=", "5.14.0") &&
                    compareVersions(this.version, "<", "6.0.0")) {
                    this.arch = "android";
                }
                else {
                    this.arch = "android_armv7";
                }
            }
        }
        const dir = core.getInput("dir") || process.env.RUNNER_WORKSPACE;
        if (!dir) {
            throw TypeError(`"dir" input may not be empty`);
        }
        this.dir = `${dir}/Qt`;
        const modules = core.getInput("modules");
        if (modules) {
            this.modules = modules.split(" ");
        }
        else {
            this.modules = [];
        }
        const archives = core.getInput("archives");
        if (archives) {
            this.archives = archives.split(" ");
        }
        else {
            this.archives = [];
        }
        const tools = core.getInput("tools");
        if (tools) {
            this.tools = [];
            for (const tool of tools.split(" ")) {
                // The tools inputs have the tool name, variant, and arch delimited by a comma
                // aqt expects spaces instead
                this.tools.push(tool.replace(/,/g, " "));
            }
        }
        else {
            this.tools = [];
        }
        const extra = core.getInput("extra");
        if (extra) {
            this.extra = extra.split(" ");
        }
        else {
            this.extra = [];
        }
        const installDeps = core.getInput("install-deps").toLowerCase();
        if (installDeps === "nosudo") {
            this.installDeps = "nosudo";
        }
        else {
            this.installDeps = installDeps === "true";
        }
        this.cache = Inputs.getBoolInput("cache");
        this.cacheKeyPrefix = core.getInput("cache-key-prefix");
        this.toolsOnly = Inputs.getBoolInput("tools-only");
        this.setEnv = Inputs.getBoolInput("set-env");
        this.aqtVersion = core.getInput("aqtversion");
        this.py7zrVersion = core.getInput("py7zrversion");
    }
    get cacheKey() {
        let cacheKey = this.cacheKeyPrefix;
        for (const keyStringArray of [
            [
                this.host,
                os.release(),
                this.target,
                this.arch,
                this.version,
                this.dir,
                this.py7zrVersion,
                this.aqtVersion,
            ],
            this.modules,
            this.archives,
            this.extra,
            this.tools,
        ]) {
            for (const keyString of keyStringArray) {
                if (keyString) {
                    cacheKey += `-${keyString}`;
                }
            }
        }
        // Cache keys cannot contain commas
        cacheKey = cacheKey.replace(/,/g, "-");
        // Cache keys cannot be larger than 512 characters
        const maxKeyLength = 512;
        if (cacheKey.length > maxKeyLength) {
            const hashedCacheKey = crypto.createHash("sha256").update(cacheKey).digest("hex");
            cacheKey = `${this.cacheKeyPrefix}-${hashedCacheKey}`;
        }
        return cacheKey;
    }
    static getBoolInput(name) {
        return core.getInput(name).toLowerCase() === "true";
    }
}
const run = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const inputs = new Inputs();
        // Qt installer assumes basic requirements that are not installed by
        // default on Ubuntu.
        if (process.platform === "linux") {
            if (inputs.installDeps) {
                const dependencies = [
                    "build-essential",
                    "libgl1-mesa-dev",
                    "libpulse-dev",
                    "libxcb-glx0",
                    "libxcb-icccm4",
                    "libxcb-image0",
                    "libxcb-keysyms1",
                    "libxcb-randr0",
                    "libxcb-render-util0",
                    "libxcb-render0",
                    "libxcb-shape0",
                    "libxcb-shm0",
                    "libxcb-sync1",
                    "libxcb-util1",
                    "libxcb-xfixes0",
                    "libxcb-xinerama0",
                    "libxcb1",
                    "libxkbcommon-dev",
                    "libxkbcommon-x11-0",
                    "libxcb-xkb-dev",
                ].join(" ");
                const updateCommand = "apt-get update";
                const installCommand = `apt-get install ${dependencies} -y`;
                if (inputs.installDeps === "nosudo") {
                    yield (0, exec_1.exec)(updateCommand);
                    yield (0, exec_1.exec)(installCommand);
                }
                else {
                    yield (0, exec_1.exec)(`sudo ${updateCommand}`);
                    yield (0, exec_1.exec)(`sudo ${installCommand}`);
                }
            }
        }
        // Restore internal cache
        let internalCacheHit = false;
        if (inputs.cache) {
            const cacheHitKey = yield cache.restoreCache([inputs.dir], inputs.cacheKey);
            if (cacheHitKey) {
                core.info(`Automatic cache hit with key "${cacheHitKey}"`);
                internalCacheHit = true;
            }
            else {
                core.info("Automatic cache miss, will cache this run");
            }
        }
        // Install Qt and tools if not cached
        if (!internalCacheHit) {
            // 7-zip is required, and not included on macOS
            if (process.platform === "darwin") {
                yield (0, exec_1.exec)("brew install p7zip");
            }
            // Install dependencies via pip
            yield execPython("pip install", ["setuptools", "wheel", `"py7zr${inputs.py7zrVersion}"`]);
            // Install aqtinstall separately: allows aqtinstall to override py7zr if required
            yield execPython("pip install", [`"aqtinstall${inputs.aqtVersion}"`]);
            // Install Qt
            if (!inputs.toolsOnly) {
                const qtArgs = [inputs.host, inputs.target, inputs.version];
                if (inputs.arch) {
                    qtArgs.push(inputs.arch);
                }
                qtArgs.push("--outputdir", inputs.dir);
                if (inputs.modules.length) {
                    qtArgs.push("--modules");
                    for (const module of inputs.modules) {
                        qtArgs.push(module);
                    }
                }
                if (inputs.archives.length) {
                    qtArgs.push("--archives");
                    for (const archive of inputs.archives) {
                        qtArgs.push(archive);
                    }
                }
                qtArgs.push(...inputs.extra);
                yield execPython("aqt install-qt", qtArgs);
            }
            // Install tools
            for (const tool of inputs.tools) {
                const toolArgs = [inputs.host, inputs.target, tool];
                toolArgs.push("--outputdir", inputs.dir);
                toolArgs.push(...inputs.extra);
                yield execPython("aqt install-tool", toolArgs);
            }
        }
        // Save automatic cache
        if (!internalCacheHit && inputs.cache) {
            const cacheId = yield cache.saveCache([inputs.dir], inputs.cacheKey);
            core.info(`Automatic cache saved with id ${cacheId}`);
        }
        // Set environment variables
        if (inputs.setEnv) {
            if (inputs.tools.length) {
                core.exportVariable("IQTA_TOOLS", nativePath(`${inputs.dir}/Tools`));
            }
            if (!inputs.toolsOnly) {
                const qtPath = nativePath(locateQtArchDir(inputs.dir));
                if (process.platform === "linux") {
                    setOrAppendEnvVar("LD_LIBRARY_PATH", nativePath(`${qtPath}/lib`));
                }
                if (process.platform !== "win32") {
                    setOrAppendEnvVar("PKG_CONFIG_PATH", nativePath(`${qtPath}/lib/pkgconfig`));
                }
                // If less than qt6, set qt5_dir variable, otherwise set qt6_dir variable
                if (compareVersions(inputs.version, "<", "6.0.0")) {
                    core.exportVariable("Qt5_Dir", qtPath); // Incorrect name that was fixed, but kept around so it doesn't break anything
                    core.exportVariable("Qt5_DIR", qtPath);
                }
                else {
                    core.exportVariable("Qt6_DIR", qtPath);
                }
                core.exportVariable("QT_PLUGIN_PATH", nativePath(`${qtPath}/plugins`));
                core.exportVariable("QML2_IMPORT_PATH", nativePath(`${qtPath}/qml`));
                core.addPath(nativePath(`${qtPath}/bin`));
            }
        }
    }
    catch (error) {
        if (error instanceof Error) {
            core.setFailed(error);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            core.setFailed(`unknown error: ${error}`);
        }
    }
});
void run();
