const express = require("express");
const path = require("path");

const app = express();

// Azure App Service provides PORT dynamically
const port = process.env.PORT || 8080;

// Serve static files (index.html, CSS, assets)
app.use(express.static(path.join(__dirname)));

// Root endpoint
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Health endpoint (used by Application Gateway)
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// Start server
app.listen(port, () => {
  console.log(`Healthcare Call Center app running on port ${port}`);
});
