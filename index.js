const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

// Middlewares

app.use(cors());
app.use(express.json());

// APIs

app.get("/", (req, res) => {
  res.send("Hello from doctor's portal server");
});

// Start the server

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Doctor's portal is running on port ${port}`);
});
