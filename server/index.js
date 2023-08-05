const keys = require("./keys");

// Express App Setup
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors()); // Cross Origin Resource Sharing 
app.use(bodyParser.json()); // Parse incoming request bodies in a middleware before your handlers, available under the req.body property.

//Postgres Client Setup
const { Pool } = require("pg");
const pgClient = new Pool({
  user: keys.pgUser,
  host: keys.pgHost,
  port: keys.pgPort,
  database: keys.pgDatabase,
  password: keys.pgPassword,
});
pgClient.on("error", () => console.log("Lost PG connection"));

pgClient.on("connect", (client) => {
    client
      .query("CREATE TABLE IF NOT EXISTS values (number INT)")
      .catch((err) => console.error(err));
  });

// Redis Client Setup
const redis = require("redis");
const redisClient = redis.createClient({
  host: keys.redisHost,
  port: keys.redisPort,
  retry_strategy: () => 1000, // if connection is lost, try to reconnect every 1000ms
});
const redisPublisher = redisClient.duplicate(); // duplicate connection

// Express route handlers
app.get("/", (req, res) => { // root route
  res.send("Hi");
});

app.get("/values/all", async (req, res) => { // get all values from postgres
  const values = await pgClient.query("SELECT * from values");
  
  res.send(values.rows);
});

app.get("/values/current", async (req, res) => {
  redisClient.hgetall("values", (err, values) => {
    res.send(values);
  });
});

app.post("/values", async (req, res) => { // post new value
  const index = req.body.index;

  if (parseInt(index) > 40) {
    return res.status(422).send("Index too high");
  }

  redisClient.hset("values", index, "Nothing yet!"); // set value to nothing yet
  redisPublisher.publish("insert", index); // publish insert event to worker
  pgClient.query("INSERT INTO values(number) VALUES($1)", [index]); // insert value into postgres
  
  res.send({ working: true });
});

app.listen(5000, (err) => {
  console.log("Listening");
});