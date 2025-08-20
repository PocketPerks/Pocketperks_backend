const express = require("express");
const prisma = require("../prisma/client");
const { getTicketOr404, ROOM } = require("../utils/helpers");

const app = express.Router();

module.exports = function (io) {
  /* 1) Create Ticket (Customer) */
  app.post("/", async (req, res) => {
    try {
      const { name, email, subject, message } = req.body || {};
      if (!name || !email || !subject || !message) {
        return res
          .status(400)
          .json({
            success: false,
            error: "name, email, subject, message are required",
          });
      }

      const { user_id } = await prisma.users.findUnique({ where: { email } });

      const ticket = await prisma.support_tickets.create({
        data: { user_id, subject, message, status: "ACTIVE", priority },
      });

      await prisma.chat_messages.create({
        data: {
          ticket_id: ticket.ticket_id,
          sender_id: user_id,
          sender_type: "USER",
          message_text: message,
        },
      });

      io.emit("ticket_created", ticket); // notify staff dashboards

      res.json({
        success: true,
        ticket,
        ws_join_payload: { ticket_id: ticket.ticket_id },
      });
    } catch (err) {
      console.error("Ticket creation error:", err);
      res
        .status(500)
        .json({ success: false, error: "Failed to create ticket" });
    }
  });

  /* 2) Staff Dashboard: show open & closed tickets */
  app.get("/dashboard", async (_req, res) => {
    try {
      const [open, closed] = await Promise.all([
        prisma.support_tickets.findMany({
          where: { status: "ACTIVE" },
          orderBy: { updated_at: "desc" }, //change this to priority.
        }),

        prisma.support_tickets.findMany({
          where: { status: "CLOSED" },
          orderBy: { updated_at: "desc" },
        }),
      ]);
      res.json({
        success: true,
        open,
        closed,
        total: open.length + closed.length,
      });
    } catch (err) {
      console.error("List tickets error:", err);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch tickets" });
    }
  });

  /* Helper: fetch ticket + messages (used by both UIs) */
  app.get("/:ticketId", async (req, res) => {
    try {
      const { ticketId } = req.params;
      const ticket = await prisma.support_tickets.findUnique({
        where: { ticket_id: Number(ticketId) },
        include: { messages: { orderBy: { send_datetime: "asc" } } },
      });
      if (!ticket)
        return res
          .status(404)
          .json({ success: false, error: "Ticket not found" });
      res.json({ success: true, ticket });
    } catch (err) {
      console.error("Get ticket error:", err);
      res.status(500).json({ success: false, error: "Failed to fetch ticket" });
    }
  });

  /* 3) Staff joins a ticket (assign admin if none yet) */
  app.patch("/:ticketId/join", async (req, res) => {
    try {
      const { ticketId } = req.params;
      const { admin_id } = req.body || {};
      if (!admin_id)
        return res
          .status(400)
          .json({ success: false, error: "admin_id required" });

      const ticket = await getTicketOr404(res, ticketId);
      if (!ticket) return;

      let updated = ticket;
      if (!ticket.admin_id) {
        updated = await prisma.support_tickets.update({
          where: { ticket_id: ticket.ticket_id },
          data: { admin_id, updated_at: new Date() },
        });
      }

      const admin = await prisma.admin_users.findUnique({ where: { id: admin_id } });

      io.to(ROOM(ticket.ticket_id)).emit("staff_joined", {
        ticket_id: ticket.ticket_id,
        admin_id,
        admin_username: admin.username,
      });

      res.json({ success: true, ticket_id: updated.ticket_id });
    } catch (err) {
      console.error("Join ticket error:", err);
      res.status(500).json({ success: false, error: "Failed to join ticket" });
    }
  });

  /* 4) Staff closes a ticket (admin only) */
  app.patch("/:ticketId/close", async (req, res) => {
    try {
      const { ticketId } = req.params;
      const { admin_id } = req.body || {};
      if (!admin_id)
        return res
          .status(400)
          .json({ success: false, error: "admin_id required" });

      const ticket = await getTicketOr404(res, ticketId);
      if (!ticket) return;

      // Only the assigned admin can close
      if (ticket.admin_id !== Number(admin_id)) {
        return res
          .status(403)
          .json({ success: false, error: "Not allowed to close this ticket" });
      }

      const updated = await prisma.support_tickets.update({
        where: { ticket_id: ticket.ticket_id },
        data: { status: "CLOSED", updated_at: new Date() },
      });

      // notify & kick everyone from the room
      io.to(ROOM(ticket.ticket_id)).emit("ticket_closed", {
        ticket_id: ticket.ticket_id,
      });
      io.in(ROOM(ticket.ticket_id)).socketsLeave(ROOM(ticket.ticket_id));

      res.json({ success: true, ticket: updated });
    } catch (err) {
      console.error("Close ticket error:", err);
      res.status(500).json({ success: false, error: "Failed to close ticket" });
    }
  });

  return app;
};
