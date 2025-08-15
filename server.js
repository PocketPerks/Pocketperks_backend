const express = require("express");
const { createServer } = require("http");
const { Server: SocketServer } = require("socket.io");
const { PrismaClient } = require("./generated/prisma");
const cors = require("cors");

const prisma = new PrismaClient();
const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: { origin: "*" },
});

app.use(cors());
app.use(express.json());

const ROOM = (ticketId) => `ticket_${ticketId}`;

// ============================
// HTTP API
// ============================

// Create ticket // working
app.post("/api/tickets", async (req, res) => {
  try {
    const { user_id, subject, message } = req.body;

    const ticket = await prisma.support_tickets.create({
      data: {
        user_id,
        subject,
        message,
        status: "ACTIVE",
        priority: 0,
      },
    });

    // Initial message
    await prisma.chat_messages.create({
      data: {
        ticket_id: ticket.ticket_id,
        sender_id: user_id,
        sender_type: "USER",
        message_text: message,
      },
    });

    // Notify staff dashboards
    io.emit("ticket_created", ticket);

    res.json({
      success: true,
      ticket,
      ws_join_payload: { ticket_id: ticket.ticket_id },
    });
    
  } catch (err) {
    console.error("Ticket creation error:", err);
    res.status(500).json({ success: false, error: "Failed to create ticket" });
  }
});

// List all tickets for dashboard
app.get("/api/dashboard/tickets", async (_req, res) => {
  try {
    const tickets = await prisma.support_tickets.findMany({
      include: {
        user: true,
        admin: true,
      },
      orderBy: { created_at: "desc" },
    });

    res.json({ success: true, tickets });
  } catch (err) {
    console.error("List tickets error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch tickets" });
  }
});

// Staff joins ticket
app.patch("/api/tickets/:ticketId/join", async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { admin_id } = req.body;

    const ticket = await prisma.support_tickets.update({
      where: { ticket_id: Number(ticketId) },
      data: { admin_id },
    });

    io.to(ROOM(ticketId)).emit("staff_joined", { ticketId, admin_id });

    res.json({
      success: true,
      ticket,
      ws_join_payload: { ticket_id: ticket.ticket_id },
    });
  } catch (err) {
    console.error("Staff join error:", err);
    res.status(500).json({ success: false, error: "Failed to join ticket" });
  }
});

// Close ticket
app.patch("/api/tickets/:ticketId/close", async (req, res) => {
  try {
    const { ticketId } = req.params;

    // Update the ticket status to CLOSED
    const ticket = await prisma.support_tickets.update({
      where: { ticket_id: Number(ticketId) },
      data: { status: "CLOSED" },
    });

    // Notify all clients in the room that the ticket was closed
    io.to(ROOM(ticketId)).emit("ticket_closed", { ticketId });

    res.json({ success: true, ticket });
  } catch (err) {
    console.error("Close ticket error:", err);
    res.status(500).json({ success: false, error: "Failed to close ticket" });
  }
});

// ============================
// WebSocket Events
// ============================
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Join ticket room
  socket.on("join_ticket", ({ ticket_id }) => {
    socket.join(ROOM(ticket_id));
    console.log(`Socket ${socket.id} joined ticket ${ticket_id}`);
  });

  // Send message
  socket.on("send_message", async (data) => {
    const { ticket_id, sender_id, sender_type, message_text } = data;

    const msg = await prisma.chat_messages.create({
      data: { ticket_id, sender_id, sender_type, message_text },
    });

    io.to(ROOM(ticket_id)).emit("new_message", msg);
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Start server
httpServer.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
