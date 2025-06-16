import express from "express";
import axios from "axios";
import Redis from "ioredis";

const app = express();
const PORT = process.env.PORT || 8000;

const url =
  "https://api.freeapi.app/api/v1/public/books?page=1&limit=10&inc=kind%252Cid%252Cetag%252CvolumeInfo&query=tech";

// interface CacheStore {
//   totalPageCount: number;
// }
// const cacheStore: CacheStore = {
//   totalPageCount: 0,
// };

const redis = new Redis({ host: "localhost", port: Number(6379) });

app.use(async function (req, res, next) {
  const key = "rate-limit";
  const value = await redis.get(key);

  if (value === null) {
    await redis.set(key, 0);
    await redis.expire(key, 60);
  }

  if (Number(value) > 10) {
    return res.status(429).json({ message: "To many Requests" });
  }

  redis.incr(key);
  next();
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
    // if (cacheStore.totalPageCount) {
    //   console.log(`Cached Hit`);
    //   return res.json({ totalPageCount: Number(cacheStore.totalPageCount) });
    // }

    const response = await axios.get(url);
    const totalPageCount = response.data?.data?.data.reduce(
      (acc: number, curr: { volumeInfo?: { pageCount?: number } }) =>
        !curr.volumeInfo?.pageCount ? 0 : curr.volumeInfo.pageCount + acc,
      0
    );

    console.log("total Page ", totalPageCount);

    // set cached
    await redis.set("TotalPageCount", totalPageCount);

    // cacheStore.totalPageCount = Number(totalPageCount);

    console.log(`Cached Miss`);

    return res.json({ totalPageCount });
  } catch (error) {
    console.error("Error fetching books:", error);
    return res.status(500).json({ error: "Failed to fetch books" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
