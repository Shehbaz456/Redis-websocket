import express from "express";
import axios from "axios";
import Redis from "ioredis";
import http from "http";
import { Server } from "socket.io";

const app = express(); // express server

const state = new Array(1000).fill(false); 

const httpServer = http.createServer(app); // http server 
const io = new Server(httpServer); // socket.io server


io.on("connection", (socket) => {
  console.log("A user connected", socket.id);
  socket.on("message", (msg) => {
    io.emit("server-message", msg);  // broadcast message to all connected clients
  })

  socket.on("checkbox-update", (data) => {
    state[data.index] = data.value; // update the state based on checkbox changes
    io.emit("checkbox-update", data); 
  });
});

const PORT = process.env.PORT || 8000;

const url =
  "https://api.freeapi.app/api/v1/public/books?page=1&limit=10&inc=kind%252Cid%252Cetag%252CvolumeInfo&query=tech";

  const redis = new Redis({ host: "localhost", port: Number(6379) });

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

app.get("/state", (req, res) => {
  return res.json({ state });
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
