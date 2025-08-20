const prisma = require("../prisma/client");
const { ROOM } = require("../utils/helpers");

function initializeSocket(io) {
    io.on("connection", (socket) => {
  // join a ticket room
  socket.on("join_ticket", async (payload, cb) => {
    try {
      const { ticket_id } = payload || {};
      const id = Number(ticket_id);
      if (!Number.isInteger(id)) throw new Error("Invalid ticket_id");

      const ticket = await prisma.support_tickets.findUnique({
        where: { ticket_id: id },
        include: { messages: { orderBy: { send_datetime: "asc" } } },
      });
      if (!ticket) throw new Error("Ticket not found");

      if (ticket.status === "CLOSED") {
        // don't join closed rooms; just return history & flag
        return cb && cb({ ok: true, status: "CLOSED", messages: ticket.messages });
      }

      socket.join(ROOM(id));
      cb &&
        cb({
          ok: true,
          status: ticket.status,
          messages: ticket.messages,
        });
    } catch (e) {
      cb && cb({ ok: false, error: e.message || "join_ticket failed" });
    }
  });

  // persist + broadcast a message (room-scoped)
  socket.on("send_message", async (payload, cb) => {
    try {
      const { ticket_id, sender_id, sender_type, message_text, attachments = null } = payload || {};
      const id = Number(ticket_id);
      if (!Number.isInteger(id)) throw new Error("Invalid ticket_id");
      if (!sender_id || !sender_type || !message_text) throw new Error("Missing fields");

      const ticket = await prisma.support_tickets.findUnique({ where: { ticket_id: id } });
      if (!ticket) throw new Error("Ticket not found");
      if (ticket.status === "CLOSED") throw new Error("Ticket is closed");

      // auto-assign admin when first admin message arrives
      let adminIdForMessage = null;
      if (sender_type === "ADMIN") {
        adminIdForMessage = Number(sender_id);
        if (!ticket.admin_id) {
          await prisma.support_tickets.update({
            where: { ticket_id: id },
            data: { admin_id: adminIdForMessage, updated_at: new Date() },
          });
        }
      }

      const saved = await prisma.chat_messages.create({
        data: {
          ticket_id: id,
          sender_id: Number(sender_id),
          sender_type,
          admin_id: adminIdForMessage,
          message_text,
          attachments,
          read_status: "SENT",
          send_datetime: new Date(),
        },
      });

      io.to(ROOM(id)).emit("new_message", saved);
      cb && cb({ ok: true, message: saved });
    } catch (e) {
      cb && cb({ ok: false, error: e.message || "send_message failed" });
    }
  });
});
}

module.exports = initializeSocket;