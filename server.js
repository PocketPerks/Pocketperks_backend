require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const { createServer } = require("http");
const { Server: SocketServer } = require("socket.io");

//import modules
const initializeSocket  = require("./socket/handler");
const userRoutes = require("./routes/users");
const ticketRoutes = require("./routes/tickets");

//app config
const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST", "PATCH"] },
});

// middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // serves /public/*.html

//Routes
app.use("/api", userRoutes);
app.use("/api/tickets", ticketRoutes(io));

//websocket
initializeSocket(io);

// Start
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`HTTP + WebSocket server listening at http://localhost:${PORT}`);
});
