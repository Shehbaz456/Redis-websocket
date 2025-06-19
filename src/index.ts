import express from "express";
import axios from "axios";
import Redis from "ioredis";
import http from "http";
import { Server } from "socket.io";

const app = express(); // express server

// const state = new Array(1000).fill(false); 

// read and write to redis
const redis = new Redis({ host: "localhost", port: Number(6379) });

const publisher = new Redis({ host: "localhost", port: Number(6379) }); // publisher for redis
const subscriber = new Redis({ host: "localhost", port: Number(6379) }); // subscriber for redis

const httpServer = http.createServer(app); // http server 
const io = new Server(httpServer); // socket.io server

const stateKey = "state";

redis.setnx(stateKey, JSON.stringify(new Array(1000).fill(false))); // initialize state in redis

subscriber.subscribe("server:broker");
subscriber.on("message", (channel, message) => {
  if (channel === "server:broker") {
    const {event,data} = JSON.parse(message);
    if (event === "checkbox-update") {
      io.emit(event, data); // emit checkbox updates to all connected clients
    }
  }
});


io.on("connection", (socket) => {
  console.log("A user connected", socket.id);
  socket.on("message", (msg) => {
    io.emit("server-message", msg);  // broadcast message to all connected clients
  })

  socket.on("checkbox-update", async (data) => {
    const state = await redis.get(stateKey);
    if(state){
      const parsedState = JSON.parse(state);
      parsedState[data.index] = data.value;
      await redis.set(stateKey, JSON.stringify(parsedState)); // update the state in redis
    }


    await publisher.publish("server:broker", JSON.stringify({event: "checkbox-update", data})); // publish checkbox updates to redis
    // state[data.index] = data.value; // update the state based on checkbox changes
    // io.emit("checkbox-update", data); 
  });
});

const PORT = process.env.PORT ?? 8000;

const url =
  "https://api.freeapi.app/api/v1/public/books?page=1&limit=10&inc=kind%252Cid%252Cetag%252CvolumeInfo&query=tech";


app.use(express.static("./public")); 

app.use(async function (req, res, next) {
  const key = "rate-limit";
  const value = await redis.get(key);

  if (value === null) {
    await redis.set(key, 0);
    await redis.expire(key, 60);
  }

  if (Number(value) > 200) {
    return res.status(429).json({ message: "To many Requests" });
  }

  redis.incr(key);
  next();
});

app.get("/state", async(req, res) => {
    const state = await redis.get(stateKey);
  if(state){
    return res.json({ state: JSON.parse(state) });
  }
  return res.json({ state :[]});
});

app.get("/", (req, res) => {
  return res.json({ message: "Hello, World!" });
});

app.get("/books", async (req, res) => {
  try {
    const response = await axios.get(url);
    return res.json(response.data);
  } catch (error) {
    console.error("Error fetching books:", error);
    return res.status(500).json({ error: "Failed to fetch books" });
  }
});

app.get("/books/total", async (req, res) => {
  try {
    // check cached
    const cachedValue = await redis.get("TotalPageCount");
    if (cachedValue) {
      console.log(`Cached Hit`);
      return res.json({ totalPageCount: Number(cachedValue) });
    }


    const response = await axios.get(url);
    const totalPageCount = response.data?.data?.data.reduce(
      (acc: number, curr: { volumeInfo?: { pageCount?: number } }) =>
        !curr.volumeInfo?.pageCount ? 0 : curr.volumeInfo.pageCount + acc,
      0
    );

    console.log("total Page ", totalPageCount);

    // set cached
    await redis.set("TotalPageCount", totalPageCount);

    console.log(`Cached Miss`);

    return res.json({ totalPageCount });
  } catch (error) {
    console.error("Error fetching books:", error);
    return res.status(500).json({ error: "Failed to fetch books" });
  }
});


httpServer.listen(PORT, () => {
  console.log(`HTTP Server is running on port ${PORT}`);
});
