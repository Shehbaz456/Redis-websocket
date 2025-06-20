"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const ioredis_1 = __importDefault(require("ioredis"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const app = (0, express_1.default)(); // express server
// const state = new Array(1000).fill(false); 
// read and write to redis
const redis = new ioredis_1.default({ host: "localhost", port: Number(6379) });
const publisher = new ioredis_1.default({ host: "localhost", port: Number(6379) }); // publisher for redis
const subscriber = new ioredis_1.default({ host: "localhost", port: Number(6379) }); // subscriber for redis
const httpServer = http_1.default.createServer(app); // http server 
const io = new socket_io_1.Server(httpServer); // socket.io server
const stateKey = "state";
redis.setnx(stateKey, JSON.stringify(new Array(1000).fill(false))); // initialize state in redis
subscriber.subscribe("server:broker");
subscriber.on("message", (channel, message) => {
    if (channel === "server:broker") {
        const { event, data } = JSON.parse(message);
        if (event === "checkbox-update") {
            io.emit(event, data); // emit checkbox updates to all connected clients
        }
    }
});
io.on("connection", (socket) => {
    console.log("A user connected", socket.id);
    socket.on("message", (msg) => {
        io.emit("server-message", msg); // broadcast message to all connected clients
    });
    socket.on("checkbox-update", (data) => __awaiter(void 0, void 0, void 0, function* () {
        const state = yield redis.get(stateKey);
        if (state) {
            const parsedState = JSON.parse(state);
            parsedState[data.index] = data.value;
            yield redis.set(stateKey, JSON.stringify(parsedState)); // update the state in redis
        }
        yield publisher.publish("server:broker", JSON.stringify({ event: "checkbox-update", data })); // publish checkbox updates to redis
        // state[data.index] = data.value; // update the state based on checkbox changes
        // io.emit("checkbox-update", data); 
    }));
});
const PORT = (_a = process.env.PORT) !== null && _a !== void 0 ? _a : 8000;
const url = "https://api.freeapi.app/api/v1/public/books?page=1&limit=10&inc=kind%252Cid%252Cetag%252CvolumeInfo&query=tech";
app.use(express_1.default.static("./public"));
app.use(function (req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        const key = "rate-limit";
        const value = yield redis.get(key);
        if (value === null) {
            yield redis.set(key, 0);
            yield redis.expire(key, 60);
        }
        if (Number(value) > 200) {
            return res.status(429).json({ message: "To many Requests" });
        }
        redis.incr(key);
        next();
    });
});
app.get("/state", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const state = yield redis.get(stateKey);
    if (state) {
        return res.json({ state: JSON.parse(state) });
    }
    return res.json({ state: [] });
}));
app.get("/", (req, res) => {
    return res.json({ message: "Hello, World!" });
});
app.get("/books", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const response = yield axios_1.default.get(url);
        return res.json(response.data);
    }
    catch (error) {
        console.error("Error fetching books:", error);
        return res.status(500).json({ error: "Failed to fetch books" });
    }
}));
app.get("/books/total", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        // check cached
        const cachedValue = yield redis.get("TotalPageCount");
        if (cachedValue) {
            console.log(`Cached Hit`);
            return res.json({ totalPageCount: Number(cachedValue) });
        }
        const response = yield axios_1.default.get(url);
        const totalPageCount = (_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.data.reduce((acc, curr) => { var _a; return !((_a = curr.volumeInfo) === null || _a === void 0 ? void 0 : _a.pageCount) ? 0 : curr.volumeInfo.pageCount + acc; }, 0);
        console.log("total Page ", totalPageCount);
        // set cached
        yield redis.set("TotalPageCount", totalPageCount);
        console.log(`Cached Miss`);
        return res.json({ totalPageCount });
    }
    catch (error) {
        console.error("Error fetching books:", error);
        return res.status(500).json({ error: "Failed to fetch books" });
    }
}));
httpServer.listen(PORT, () => {
    console.log(`HTTP Server is running on port ${PORT}`);
});
